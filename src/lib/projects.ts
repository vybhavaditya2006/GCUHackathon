import "server-only";
import { cache } from "react";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { briefAccess, type BriefAccess, type CharterModel, type ViewerMembership } from "@/lib/access";
import { userDb } from "@/lib/db";

export interface ProjectRow {
  id: string;
  sponsor_id: string;
  title: string;
  problem_statement: string;
  public_summary: string;
  required_skills: string[];
  sensitivity: "low" | "medium" | "high";
  hours_per_week: number;
  start_date: string | null;
  end_date: string | null;
  status: "open" | "active" | "completed";
  sponsor: { full_name: string; organisation: string | null } | null;
}

export interface CharterRow {
  version: number;
  model: CharterModel;
  terms: Record<string, unknown>;
  published_at: string;
}

export interface MilestoneRow {
  id: string;
  position: number;
  title: string;
  required_skills: string[];
  acceptance_criteria: string;
  amount: number;
  status: string;
  due_date: string | null;
}

export interface ProjectView {
  user: CurrentUser;
  project: ProjectRow;
  charter: CharterRow | null;
  milestones: MilestoneRow[];
  membership: (ViewerMembership & { isLead: boolean }) | null;
  isSponsor: boolean;
  /** What RLS actually allows, not what the UI assumes. */
  briefReadable: boolean;
  access: BriefAccess;
  /** Short label for the role badge. */
  roleLabel: string;
}

export function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

/**
 * Everything the project pages need about "this project, as seen by this user".
 * All reads go through the user's own session, so RLS applies.
 */
export const getProjectView = cache(async (projectId: string): Promise<ProjectView | null> => {
  const user = await requireUser();
  if (!isUuid(projectId)) return null;
  const db = await userDb();

  const [project, charter, milestones, membership, brief] = await Promise.all([
    db
      .from("projects")
      .select(
        "id, sponsor_id, title, problem_statement, public_summary, required_skills, sensitivity, hours_per_week, start_date, end_date, status, sponsor:profiles(full_name, organisation)",
      )
      .eq("id", projectId)
      .maybeSingle(),
    db
      .from("charters")
      .select("version, model, terms, published_at")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("milestones")
      .select("id, position, title, required_skills, acceptance_criteria, amount, status, due_date")
      .eq("project_id", projectId)
      .order("position"),
    db
      .from("memberships")
      .select("role, status, charter_version, is_lead")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle(),
    // No content is selected here: this only asks RLS "may this user read the brief?".
    db.from("project_briefs").select("project_id").eq("project_id", projectId).maybeSingle(),
  ]);

  if (!project.data) return null;
  const projectRow = project.data as unknown as ProjectRow;
  const charterRow = (charter.data as CharterRow | null) ?? null;
  const isSponsor = projectRow.sponsor_id === user.id;

  const viewerMembership = membership.data
    ? {
        role: membership.data.role,
        status: membership.data.status,
        charterVersion: membership.data.charter_version,
        isLead: membership.data.is_lead,
      }
    : null;

  const briefReadable = Boolean(brief.data);
  const explained = briefAccess({
    isSponsor,
    isAdmin: user.role === "admin",
    membership: viewerMembership,
    latestCharterVersion: charterRow?.version ?? null,
  });

  return {
    user,
    project: projectRow,
    charter: charterRow,
    milestones: ((milestones.data ?? []) as MilestoneRow[]).map((m) => ({ ...m, amount: Number(m.amount) })),
    membership: viewerMembership,
    isSponsor,
    briefReadable,
    // RLS has the last word on whether the brief is open.
    access: { ...explained, unlocked: briefReadable, canAccept: explained.canAccept && !briefReadable },
    roleLabel: roleLabel(user, isSponsor, viewerMembership),
  };
});

function roleLabel(user: CurrentUser, isSponsor: boolean, membership: ProjectView["membership"]): string {
  if (isSponsor) return "Sponsor";
  if (membership && membership.status === "active") {
    const role = membership.role === "expert" ? "Expert" : "Student";
    return membership.isLead ? `${role} (lead)` : role;
  }
  if (membership?.status === "invited") return "Invited";
  if (membership?.status === "exited") return "Former member";
  if (user.role === "admin") return "Admin";
  return "Not a member";
}

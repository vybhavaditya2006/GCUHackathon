import "server-only";
import { isPaidModel } from "@/lib/access";
import { AgentError, runAgent } from "@/lib/agents/gateway";
import { matchingInstructions, matchingSchema, matchingTask } from "@/lib/agents/prompts/matching";
import { adminDb } from "@/lib/db";
import { append } from "@/lib/ledger";
import {
  rankCandidates,
  templateReason,
  type Candidate,
  type CandidateProfile,
  type MatchProject,
} from "@/lib/matchingScore";

/** A rule said no (not the sponsor, already invited, ...). Safe to show the user. */
export class MatchingError extends Error {}

export interface MatchRun {
  shortlisted: Candidate[];
  excluded: Candidate[];
  /** False when the LLM was unavailable and the reasons are the fixed-wording fallback. */
  explainedByLlm: boolean;
  /** Hash of the MATCH_RUN ledger entry. */
  hash: string;
}

/**
 * Filters -> score -> LLM explanation. The ranking is the pure rule in
 * matchingScore.ts; the LLM only writes one sentence per shortlisted candidate.
 * The whole result is stored in the MATCH_RUN ledger entry.
 */
export async function runMatching(projectId: string, ownerId: string): Promise<MatchRun> {
  const db = adminDb();
  const [projectRes, charterRes, ownerRes, peopleRes, membershipsRes] = await Promise.all([
    db
      .from("projects")
      .select("sponsor_id, title, public_summary, required_skills, competitors, hours_per_week")
      .eq("id", projectId)
      .maybeSingle(),
    db.from("charters").select("model, terms").eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("profiles").select("role").eq("id", ownerId).maybeSingle(),
    db
      .from("profiles")
      .select(
        "id, full_name, role, organisation, verified, skills, proven_skills, completed_projects, interests, hours_per_week, affiliations, is_minor, guardian_consent",
      )
      .in("role", ["student", "expert"]),
    db.from("memberships").select("project_id, user_id, status"),
  ]);

  const project = projectRes.data;
  if (!project) throw new MatchingError("Project not found.");
  if (project.sponsor_id !== ownerId && ownerRes.data?.role !== "admin") {
    throw new MatchingError("Only the sponsor or a platform admin can run matching.");
  }

  const memberships = membershipsRes.data ?? [];
  const profiles: CandidateProfile[] = (peopleRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    role: p.role,
    organisation: p.organisation,
    verified: p.verified,
    skills: p.skills,
    provenSkills: p.proven_skills,
    completedProjects: p.completed_projects,
    interests: p.interests,
    hoursPerWeek: p.hours_per_week,
    affiliations: p.affiliations,
    isMinor: p.is_minor,
    guardianConsent: p.guardian_consent,
    activeProjects: memberships.filter((m) => m.user_id === p.id && m.status === "active").length,
    membership: memberships.find((m) => m.user_id === p.id && m.project_id === projectId)?.status ?? null,
  }));

  const terms = (charterRes.data?.terms ?? {}) as Record<string, unknown>;
  const matchProject: MatchProject = {
    requiredSkills: project.required_skills,
    competitors: project.competitors,
    hoursPerWeek: project.hours_per_week,
    paid: charterRes.data ? isPaidModel(charterRes.data.model) : false,
    minorsNeedGuardianConsent: terms.minorsNeedGuardianConsent !== false,
    topicText: `${project.title}\n${project.public_summary}`,
  };

  const { shortlisted, excluded } = rankCandidates(profiles, matchProject);

  // The LLM sees the score breakdown only: no contact details, no free text from profiles.
  let explainedByLlm = false;
  try {
    const result = await runAgent({
      agent: "matching",
      projectId,
      ownerId,
      instructions: matchingInstructions,
      task: matchingTask,
      documents: [
        {
          name: "candidate_scores",
          text: JSON.stringify(
            shortlisted.map((c) => ({
              id: c.id,
              name: c.name,
              role: c.role,
              score: c.score,
              breakdown: c.breakdown,
              matchedSkills: c.matchedSkills,
              skillsProvenByReviewedWork: c.provenMatched,
              completedProjects: c.completedProjects,
              hoursPerWeek: c.hoursPerWeek,
            })),
          ),
        },
        { name: "project_needs", text: `Required skills: ${project.required_skills.join(", ")}. Hours per week: ${project.hours_per_week}.` },
      ],
      schema: matchingSchema,
      inputSummary: `Score breakdown of ${shortlisted.length} shortlisted candidates`,
      summarise: (out) => `Explained ${out.reasons.length} candidate scores`,
    });
    for (const c of shortlisted) c.reason = result.output.reasons.find((r) => r.id === c.id)?.reason;
    explainedByLlm = true;
  } catch (err) {
    if (!(err instanceof AgentError)) throw err;
  }
  for (const c of shortlisted) c.reason ??= templateReason(c);

  const hash = await append({
    projectId,
    actor: "agent:matching",
    onBehalfOf: ownerId,
    event: "MATCH_RUN",
    payload: {
      shortlisted: shortlisted.map((c) => c.name),
      excluded: excluded.map((c) => ({ name: c.name, reason: c.excludedReason })),
      candidates: [...shortlisted, ...excluded],
      explained_by_llm: explainedByLlm,
      rule: "skills 40, track record 20, topic fit 15, availability 15, newcomer 10",
    },
  });

  return { shortlisted, excluded, explainedByLlm, hash };
}

/** The sponsor invites a candidate; invite_member writes MEMBER_INVITED. They still have to accept the charter. */
export async function invite(projectId: string, sponsorId: string, userId: string, role: "student" | "expert") {
  const { data, error } = await adminDb().rpc("invite_member", {
    p_project_id: projectId,
    p_sponsor_id: sponsorId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new MatchingError(error.message.replace(/^invite_member:\s*/, ""));
  return data as { seq: number; hash: string };
}

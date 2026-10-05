import "server-only";
import { z } from "zod";
import { isPaidModel } from "@/lib/access";
import { adminDb } from "@/lib/db";
import { EscrowError, release } from "@/lib/escrow";

// The corner cases: a member leaves, the charter goes unpaid, a milestone is
// rejected, a dispute is raised and resolved. Each call goes to one SQL function
// (004_corner_cases.sql) that writes the change and its ledger entry together.

/** A rule said no. Safe to show the user. */
export class CornerError extends Error {}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminDb().rpc(fn, args);
  if (error) throw new CornerError(error.message.replace(new RegExp(`^${fn}:\\s*`), ""));
  return data as T;
}

/** A member leaves. activeFraction null keeps their current fraction. */
export function exitMember(projectId: string, userId: string, activeFraction: number | null, demoBy: string | null = null) {
  return call<{ active_fraction: number; seq: number }>("exit_member", {
    p_project_id: projectId,
    p_user_id: userId,
    p_active_fraction: activeFraction,
    p_demo_by: demoBy,
  });
}

export function resolveDispute(disputeId: string, adminId: string, inFavourOf: "team" | "sponsor", resolution: string) {
  return call<{ seq: number }>("resolve_dispute", {
    p_dispute_id: disputeId,
    p_admin_id: adminId,
    p_in_favour_of: inFavourOf,
    p_resolution: resolution,
  });
}

export const demoControl = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quit"), projectId: z.uuid(), userId: z.uuid(), percent: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal("silent"), projectId: z.uuid() }),
  z.object({ action: z.literal("unpaid"), projectId: z.uuid() }),
  z.object({ action: z.literal("reject"), projectId: z.uuid(), citeCriterion: z.boolean() }),
  z.object({ action: z.literal("dispute"), projectId: z.uuid() }),
]);

export type DemoControl = z.infer<typeof demoControl>;

/**
 * An admin triggers a corner case from the demo controls. The action is recorded
 * under the person who would really take it (the student, the sponsor, the team
 * lead), with demo_control_by = the admin in the ledger payload.
 */
export async function runDemoControl(adminId: string, input: DemoControl): Promise<string> {
  const db = adminDb();
  const [projectRes, milestonesRes, membersRes, charterRes] = await Promise.all([
    db.from("projects").select("sponsor_id").eq("id", input.projectId).maybeSingle(),
    db.from("milestones").select("id, title, status, acceptance_criteria").eq("project_id", input.projectId).order("position"),
    db.from("memberships").select("user_id, role, status, is_lead").eq("project_id", input.projectId),
    db.from("charters").select("version, model, terms").eq("project_id", input.projectId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!projectRes.data) throw new CornerError("Project not found.");
  const sponsorId = projectRes.data.sponsor_id as string;
  const milestones = milestonesRes.data ?? [];
  const withStatus = (status: string, message: string) => {
    const m = milestones.find((x) => x.status === status);
    if (!m) throw new CornerError(message);
    return m;
  };

  switch (input.action) {
    case "quit": {
      const result = await exitMember(input.projectId, input.userId, input.percent / 100, adminId);
      return `Recorded the exit at ${Math.round(result.active_fraction * 100)}% of the milestone (ledger #${result.seq}). Access is revoked; open Credit & Payment to see the engine's new split.`;
    }
    case "silent": {
      const m = withStatus("submitted", "No milestone is waiting for the sponsor.");
      const days = (charterRes.data?.terms as { sponsorSilentDays?: number } | undefined)?.sponsorSilentDays ?? 10;
      try {
        const result = await release(m.id, adminId, {
          auto_accepted: true,
          auto_accept_reason: `Sponsor silent past the ${days}-day review window in the charter (simulated from the demo controls)`,
        });
        return `Auto-accepted "${m.title}" after the sponsor's ${days}-day window (ledger #${result.seq}): ${result.payouts} payouts and ${result.credentials} credentials issued.`;
      } catch (err) {
        if (err instanceof EscrowError) throw new CornerError(err.message);
        throw err;
      }
    }
    case "unpaid": {
      const charter = charterRes.data;
      if (!charter) throw new CornerError("This project has no charter.");
      if (!isPaidModel(charter.model)) throw new CornerError("This project is already unpaid.");
      const result = await call<{ charter_version: number; escrow_refunded: number; seq: number }>("publish_charter_version", {
        p_project_id: input.projectId,
        p_sponsor_id: sponsorId,
        p_model: "knowledge_sharing",
        p_terms: { ...(charter.terms as object), feePct: 0, aiReservePct: 0, expertPct: 0 },
        p_demo_by: adminId,
      });
      return `Published Charter v${result.charter_version} as knowledge-sharing (ledger #${result.seq}). ₹${result.escrow_refunded} of unreleased escrow refunded. Every member's brief is locked until they re-accept, or they can leave with their credit.`;
    }
    case "reject": {
      const m = withStatus("submitted", "No milestone is waiting for the sponsor.");
      const result = await call<{ seq: number }>("reject_milestone", {
        p_milestone_id: m.id,
        p_sponsor_id: sponsorId,
        p_criterion: input.citeCriterion ? m.acceptance_criteria : "",
        p_reason: "The sponsor is not satisfied with the result.",
        p_demo_by: adminId,
      });
      return `The sponsor rejected "${m.title}", citing "${m.acceptance_criteria}" (ledger #${result.seq}). The team can now dispute it.`;
    }
    case "dispute": {
      const m = withStatus("rejected", "No milestone has been rejected, so there is nothing to dispute.");
      const team = (membersRes.data ?? []).filter((x) => x.status === "active" && x.role === "student");
      const lead = team.find((x) => x.is_lead) ?? team[0];
      if (!lead) throw new CornerError("There is no active student to raise the dispute.");
      const result = await call<{ escrow_frozen: number; seq: number }>("raise_dispute", {
        p_milestone_id: m.id,
        p_user_id: lead.user_id,
        p_reason: "The cited criterion was met: the expert's review and the ledger evidence show it.",
        p_demo_by: adminId,
      });
      return `The team lead disputed the rejection (ledger #${result.seq}). ₹${result.escrow_frozen} of escrow is frozen until an admin resolves it below.`;
    }
  }
}

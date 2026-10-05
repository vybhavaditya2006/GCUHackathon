import "server-only";
import { z } from "zod";
import { isPaidModel, type CharterModel } from "@/lib/access";
import { adminDb } from "@/lib/db";
import {
  computeSplit,
  type ReviewedContribution,
  type SplitMember,
  type SplitResult,
} from "@/lib/engine/computeSplit";

const termsSchema = z.object({
  feePct: z.number(),
  aiReservePct: z.number(),
  expertPct: z.number(),
  equalPct: z.number(),
  weightedPct: z.number(),
  credentials: z.array(z.string()).default([]),
});

export type SplitSummary = Omit<SplitResult, "payouts">;

export interface CredentialGrant {
  userId: string;
  name: string;
  title: string;
}

export interface LoadedSplit {
  milestone: { id: string; projectId: string; title: string; amount: number; status: string };
  charter: { version: number; model: CharterModel };
  split: SplitResult;
  credentials: CredentialGrant[];
}

/**
 * Gathers the engine's inputs for one milestone (charter terms, members who
 * accepted the charter, expert-reviewed contributions) and runs computeSplit.
 * All the I/O is here; the engine itself stays pure.
 */
export async function loadSplit(milestoneId: string): Promise<LoadedSplit | null> {
  const db = adminDb();

  const { data: milestone } = await db
    .from("milestones")
    .select("id, project_id, title, amount, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) return null;

  const [charterRes, membersRes, contributionsRes] = await Promise.all([
    db
      .from("charters")
      .select("version, model, terms")
      .eq("project_id", milestone.project_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Invited people who never accepted are not on the split; people who left stay, pro-rata.
    db
      .from("memberships")
      .select("user_id, role, active_fraction, accepted_at")
      .eq("project_id", milestone.project_id)
      .in("role", ["expert", "student"])
      .neq("status", "invited")
      .not("charter_version", "is", null)
      .order("accepted_at"),
    db
      .from("contributions")
      .select("author_id, title, ai_share, ledger_seq, reviews(verdict, impact, reviewer_id)")
      .eq("milestone_id", milestone.id)
      .order("created_at"),
  ]);
  if (!charterRes.data) return null;

  const terms = termsSchema.parse(charterRes.data.terms);
  const memberRows = membersRes.data ?? [];
  const contributionRows = (contributionsRes.data ?? []) as {
    author_id: string;
    title: string;
    ai_share: number;
    ledger_seq: number | null;
    reviews: { verdict: string; impact: number; reviewer_id: string }[];
  }[];

  const ids = new Set<string>(memberRows.map((m) => m.user_id));
  for (const c of contributionRows) for (const r of c.reviews) ids.add(r.reviewer_id);
  const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", [...ids]);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  const members: SplitMember[] = memberRows.map((m) => ({
    userId: m.user_id,
    name: names.get(m.user_id) ?? "Unknown member",
    role: m.role,
    activeFraction: Number(m.active_fraction),
  }));

  // Only work an expert approved counts. A flagged or unreviewed file earns nothing.
  const reviewed: ReviewedContribution[] = contributionRows.flatMap((c) => {
    const review = c.reviews.find((r) => r.verdict === "approved");
    if (!review) return [];
    return [
      {
        authorId: c.author_id,
        impact: review.impact,
        ledgerSeq: c.ledger_seq ?? undefined,
        aiShare: Number(c.ai_share),
        title: c.title,
        reviewedBy: names.get(review.reviewer_id),
      },
    ];
  });

  // Under an unpaid charter nothing is distributed, whatever the milestone was once worth.
  const budget = isPaidModel(charterRes.data.model) ? Math.round(Number(milestone.amount)) : 0;
  const split = computeSplit(
    budget,
    { ...terms, version: charterRes.data.version },
    members,
    reviewed,
  );

  const credentials = split.payouts
    .filter((p) => p.role === "student" && p.impact > 0)
    .flatMap((p) => terms.credentials.map((title) => ({ userId: p.userId, name: p.name, title })));

  return {
    milestone: {
      id: milestone.id,
      projectId: milestone.project_id,
      title: milestone.title,
      amount: Math.round(Number(milestone.amount)),
      status: milestone.status,
    },
    charter: { version: charterRes.data.version, model: charterRes.data.model },
    split,
    credentials,
  };
}

import "server-only";
import { adminDb } from "@/lib/db";
import { sha256Hex, similarity } from "@/lib/integrity";

// Contributions, reviews and milestone submission. Each call goes to one SQL
// function that writes the change and its ledger entry in one transaction.

/** A rule in the SQL function said no. Safe to show the user. */
export class WorkError extends Error {}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminDb().rpc(fn, args);
  if (error) throw new WorkError(error.message.replace(new RegExp(`^${fn}:\\s*`), ""));
  return data as T;
}

export interface NewContribution {
  milestoneId: string;
  authorId: string;
  title: string;
  fileName: string;
  bytes: Uint8Array;
  aiDeclaration: string;
}

export interface ContributionResult {
  contributionId: string;
  artefactHash: string;
  similarity: number;
  matched: string | null;
  flagged: boolean;
  seq: number;
}

/** Fingerprints the file, runs the (mocked) similarity check and records the contribution. */
export async function addContribution(input: NewContribution): Promise<ContributionResult> {
  const artefactHash = sha256Hex(input.bytes);
  const check = similarity(new TextDecoder().decode(input.bytes));

  const result = await call<{ contribution_id: string; flagged: boolean; seq: number }>("add_contribution", {
    p_milestone_id: input.milestoneId,
    p_author_id: input.authorId,
    p_title: input.title,
    p_artefact_name: input.fileName,
    p_artefact_hash: artefactHash,
    p_ai_declaration: input.aiDeclaration,
    p_agent_used: null,
    p_ai_share: 0,
    p_similarity: check.score,
  });

  return {
    contributionId: result.contribution_id,
    artefactHash,
    similarity: check.score,
    matched: check.matched,
    flagged: result.flagged,
    seq: result.seq,
  };
}

export interface NewReview {
  contributionId: string;
  reviewerId: string;
  verdict: "approved" | "changes_requested" | "rejected";
  impact: number;
  notes: string;
}

export function addReview(input: NewReview) {
  return call<{ review_id: string; impact: number; seq: number; hash: string }>("add_review", {
    p_contribution_id: input.contributionId,
    p_reviewer_id: input.reviewerId,
    p_verdict: input.verdict,
    p_impact: input.impact,
    p_notes: input.notes,
  });
}

export function submitMilestone(milestoneId: string, actorId: string) {
  return call<{ seq: number; hash: string }>("submit_milestone", {
    p_milestone_id: milestoneId,
    p_actor_id: actorId,
  });
}

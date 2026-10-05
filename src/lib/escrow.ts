import "server-only";
import { z } from "zod";
import { adminDb } from "@/lib/db";
import { loadSplit } from "@/lib/split";

// Escrow state machine: funded -> released | frozen | refunded. Escrow is
// simulated (a database row, no money moves). freeze / refund arrive with the
// dispute flow.

const releaseResult = z.object({
  seq: z.number().int(),
  hash: z.string(),
  paid_total: z.number(),
  payouts: z.number().int(),
  credentials: z.number().int(),
});

export interface EscrowRelease {
  seq: number;
  hash: string;
  paidTotal: number;
  payouts: number;
  credentials: number;
}

/** A rule in the SQL function said no (wrong status, not the sponsor, ...). Safe to show the user. */
export class EscrowError extends Error {}

/** The sponsor funds a draft milestone into (simulated) escrow; fund_escrow writes ESCROW_FUNDED. */
export async function fund(milestoneId: string, sponsorId: string): Promise<{ reference: string; seq: number }> {
  const { data, error } = await adminDb().rpc("fund_escrow", {
    p_milestone_id: milestoneId,
    p_sponsor_id: sponsorId,
  });
  if (error) throw new EscrowError(error.message.replace(/^fund_escrow:\s*/, ""));
  const result = z.object({ reference: z.string(), seq: z.number().int() }).parse(data);
  return result;
}

/**
 * Accepts a submitted milestone and releases its escrow. The pure engine
 * computes the split; accept_milestone then checks it fits the escrow, stores
 * the payouts with their receipts and writes MILESTONE_ACCEPTED, PAYOUT_ISSUED
 * and CREDENTIAL_ISSUED to the ledger, all in one transaction.
 */
export async function release(milestoneId: string, actorId: string): Promise<EscrowRelease> {
  const loaded = await loadSplit(milestoneId);
  if (!loaded) throw new EscrowError("milestone not found, or its project has no charter");

  const { payouts, ...summary } = loaded.split;
  const { data, error } = await adminDb().rpc("accept_milestone", {
    p_milestone_id: milestoneId,
    p_actor_id: actorId,
    p_charter_version: loaded.charter.version,
    // The whole engine payout is stored as the receipt: lines, ledger refs and the breakdown.
    p_payouts: payouts.map((p) => ({ user_id: p.userId, amount: p.amount, receipt: p })),
    p_credentials: loaded.credentials.map((c) => ({ user_id: c.userId, title: c.title })),
    p_summary: summary,
  });
  if (error) throw new EscrowError(error.message.replace(/^accept_milestone:\s*/, ""));

  const result = releaseResult.parse(data);
  return {
    seq: result.seq,
    hash: result.hash,
    paidTotal: result.paid_total,
    payouts: result.payouts,
    credentials: result.credentials,
  };
}

import "server-only";
import { adminDb } from "@/lib/db";

export type LedgerEvent =
  | "PROJECT_POSTED"
  | "CHARTER_PUBLISHED"
  | "CHARTER_ACCEPTED"
  | "MILESTONES_APPROVED"
  | "MATCH_RUN"
  | "MEMBER_INVITED"
  | "ESCROW_FUNDED"
  | "AGENT_ACTION"
  | "AGENT_DRAFT_APPROVED"
  | "CONTRIBUTION_ADDED"
  | "SIMILARITY_FLAGGED"
  | "REVIEW_DONE"
  | "MILESTONE_SUBMITTED"
  | "MILESTONE_ACCEPTED"
  | "MILESTONE_REJECTED"
  | "PAYOUT_ISSUED"
  | "CREDENTIAL_ISSUED"
  | "MEMBER_EXITED"
  | "DISPUTE_RAISED"
  | "DISPUTE_RESOLVED"
  | "BRIEF_VIEWED"
  | "CORRECTION";

export interface LedgerAppend {
  projectId: string | null;
  /** '<user uuid>' or 'agent:<name>'. */
  actor: string;
  /** The human owner. Required when the actor is an agent. */
  onBehalfOf?: string | null;
  event: LedgerEvent;
  payload?: Record<string, unknown>;
}

export interface VerifyResult {
  ok: boolean;
  brokenAt: number | null;
  checked: number;
  lastHash: string;
}

/** Appends one entry through ledger_append (hashing happens in SQL) and returns its hash. */
export async function append(entry: LedgerAppend): Promise<string> {
  const { data, error } = await adminDb().rpc("ledger_append", {
    p_project_id: entry.projectId,
    p_actor: entry.actor,
    p_on_behalf_of: entry.onBehalfOf ?? null,
    p_event: entry.event,
    p_payload: entry.payload ?? {},
  });
  if (error) throw new Error(`ledger append failed: ${error.message}`);
  return data as string;
}

/** Re-hashes the whole chain in SQL. brokenAt is the first bad seq. */
export async function verify(): Promise<VerifyResult> {
  const { data, error } = await adminDb().rpc("ledger_verify");
  if (error) throw new Error(`ledger verify failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean;
    broken_at: number | null;
    checked: number;
    last_hash: string;
  };
  return { ok: row.ok, brokenAt: row.broken_at, checked: row.checked, lastHash: row.last_hash };
}

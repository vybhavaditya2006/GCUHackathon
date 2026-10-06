import { describe, expect, it } from "vitest";
import { reviewedWeights, toLedgerRows, type LedgerEntry } from "./ledgerView";

const names = { priya: "Priya Nair", arjun: "Arjun Mehta", kiran: "Dr. Kiran Shetty" };

let seq = 0;
const entry = (over: Partial<LedgerEntry> & Pick<LedgerEntry, "event">): LedgerEntry => ({
  seq: ++seq,
  ts: "2026-10-08T10:50:00Z",
  actor: "priya",
  on_behalf_of: null,
  payload: {},
  hash: "ab".repeat(32),
  ...over,
});

const entries: LedgerEntry[] = [
  entry({
    event: "AGENT_ACTION",
    actor: "agent:research",
    on_behalf_of: "priya",
    payload: { agent: "research", draft_id: "d1", summary: "Literature summary" },
  }),
  entry({ event: "AGENT_DRAFT_APPROVED", payload: { agent: "research", draft_id: "d1", edited: true } }),
  entry({
    event: "CONTRIBUTION_ADDED",
    payload: { contribution_id: "c1", title: "Lit review", artefact: "lit.pdf", artefact_hash: "f".repeat(64), ai_share: 0.8 },
  }),
  entry({ event: "CONTRIBUTION_ADDED", actor: "arjun", payload: { contribution_id: "c2", title: "Copied notes", ai_share: 0 } }),
  entry({
    event: "SIMILARITY_FLAGGED",
    actor: "agent:integrity",
    on_behalf_of: "arjun",
    payload: { contribution_id: "c2", artefact: "notes.md", similarity: 0.82, threshold: 0.8 },
  }),
  entry({ event: "CONTRIBUTION_ADDED", actor: "arjun", payload: { contribution_id: "c3", title: "Pipeline" } }),
  entry({
    event: "REVIEW_DONE",
    actor: "kiran",
    payload: { contribution_id: "c1", author_id: "priya", verdict: "approved", impact: 6 },
  }),
  entry({
    event: "REVIEW_DONE",
    actor: "kiran",
    payload: { contribution_id: "c3", author_id: "arjun", verdict: "approved", impact: 2 },
  }),
  entry({ event: "PAYOUT_ISSUED", actor: "kiran", payload: { user_id: "priya", amount: 25783, payment_ref: "SIM-PAY-1" } }),
];

describe("toLedgerRows", () => {
  const rows = toLedgerRows(entries, names);

  it("shows an agent with its human owner and marks an approved draft", () => {
    expect(rows[0]).toMatchObject({ isAgent: true, actorName: "research", ownerName: "Priya Nair", aiShare: 1 });
    expect(rows[0].verification).toEqual({ label: "Approved by owner", tone: "verified" });
  });

  it("links a contribution to its later review, flag or neither", () => {
    expect(rows[2].verification).toEqual({ label: "Reviewed, impact 6", tone: "verified" });
    expect(rows[2].evidence).toEqual({ label: "lit.pdf", hash: "f".repeat(64) });
    expect(rows[2].aiShare).toBe(0.8);
    expect(rows[3].verification.tone).toBe("alert");
  });

  it("describes money in rupees and tags it for the money filter", () => {
    expect(rows[8].action).toBe("Paid ₹25,783 to Priya Nair");
    expect(rows[8].category).toBe("money");
    expect(rows[8].evidence).toEqual({ label: "SIM-PAY-1", hash: null });
  });
});

describe("reviewedWeights", () => {
  it("weights by approved reviewed impact only", () => {
    expect(reviewedWeights(entries, names)).toEqual([
      { userId: "priya", name: "Priya Nair", impact: 6, weight: 0.75 },
      { userId: "arjun", name: "Arjun Mehta", impact: 2, weight: 0.25 },
    ]);
  });
});

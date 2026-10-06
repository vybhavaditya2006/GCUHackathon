// Pure: turns raw ledger rows into what the Ledger page shows. No I/O.
import { formatRupees } from "@/lib/engine/computeSplit";

export interface LedgerEntry {
  seq: number;
  ts: string;
  actor: string;
  on_behalf_of: string | null;
  event: string;
  payload: Record<string, unknown>;
  hash: string;
}

export type Tone = "neutral" | "ai" | "verified" | "alert" | "pending";
export type LedgerCategory = "money" | "review" | "other";

export interface LedgerViewRow {
  seq: number;
  time: string;
  /** Person's name, or the agent's name for agent rows. */
  actorName: string;
  isAgent: boolean;
  /** For agent rows: the human who owns the action. */
  ownerName: string | null;
  event: string;
  action: string;
  evidence: { label: string; hash: string | null } | null;
  /** 0..1 when the entry declares one; null otherwise. */
  aiShare: number | null;
  verification: { label: string; tone: Tone };
  hash: string;
  category: LedgerCategory;
}

export interface ReviewedWeight {
  userId: string;
  name: string;
  impact: number;
  /** 0..1 share of the total reviewed impact. */
  weight: number;
  /** 0..1: how much of this person's reviewed impact was AI-assisted. */
  aiShare: number;
}

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numOf = (v: unknown): number | null => (typeof v === "number" ? v : null);
const rupees = (v: unknown) => formatRupees(Number(v ?? 0));

/** "v2 · replaces Baseline CNN notes (v1)": how a contribution that builds on an earlier one is shown. */
export function versionLabel(version: number, parentTitle: string | null, parentVersion: number): string {
  return `v${version} · replaces ${parentTitle ?? "an earlier contribution"} (v${parentVersion})`;
}

const MONEY = new Set(["ESCROW_FUNDED", "MILESTONE_ACCEPTED", "PAYOUT_ISSUED"]);
const REVIEW = new Set(["REVIEW_DONE", "SIMILARITY_FLAGGED", "MILESTONE_REJECTED", "DISPUTE_RAISED", "DISPUTE_RESOLVED"]);

function describe(e: LedgerEntry, nameOf: (id: unknown) => string): string {
  const p = e.payload;
  switch (e.event) {
    case "PROJECT_POSTED":
      return "Posted the project";
    case "CHARTER_PUBLISHED":
      return `Published Charter v${p.charter_version} (${String(p.model).replace("_", " ")})`;
    case "CHARTER_ACCEPTED":
      return `Accepted Charter v${p.charter_version} as ${p.role}`;
    case "MILESTONES_APPROVED":
      return `Approved milestones: ${Array.isArray(p.milestones) ? p.milestones.join("; ") : ""}`;
    case "MATCH_RUN": {
      const shortlisted = Array.isArray(p.shortlisted) ? p.shortlisted.length : 0;
      const excluded = Array.isArray(p.excluded) ? p.excluded.length : 0;
      return `Matching run: ${shortlisted} shortlisted, ${excluded} filtered out`;
    }
    case "MEMBER_INVITED":
      return `Invited ${str(p.name) ?? nameOf(p.user_id)} as ${p.role}`;
    case "ESCROW_FUNDED":
      return `Funded escrow ${rupees(p.amount)} for "${p.milestone}"`;
    case "AGENT_ACTION":
      return str(p.summary) ?? `Ran the ${p.agent} agent`;
    case "AGENT_DRAFT_APPROVED":
      return `Approved the ${p.agent} agent draft${p.edited ? " after editing it" : ""}`;
    case "CONTRIBUTION_ADDED": {
      const title = str(p.title) ?? "Added a contribution";
      return str(p.builds_on) ? `${title} · ${versionLabel(Number(p.version), str(p.builds_on_title), Number(p.builds_on_version))}` : title;
    }
    case "SIMILARITY_FLAGGED":
      return `Similarity ${Math.round(Number(p.similarity) * 100)}% on ${p.artefact} (threshold ${Math.round(Number(p.threshold) * 100)}%)`;
    case "REVIEW_DONE":
      return `Reviewed ${nameOf(p.author_id)}'s work: ${String(p.verdict).replace("_", " ")}, impact ${p.impact}`;
    case "MILESTONE_SUBMITTED":
      return `Submitted "${p.milestone}"`;
    case "MILESTONE_ACCEPTED":
      return `${(p.summary as { auto_accepted?: boolean } | undefined)?.auto_accepted ? "Auto-accepted (sponsor silent)" : "Accepted"} "${p.milestone}" under Charter v${p.charter_version}; ${rupees(p.paid_total)} paid out`;
    case "PAYOUT_ISSUED":
      return `Paid ${rupees(p.amount)} to ${nameOf(p.user_id)}`;
    case "CREDENTIAL_ISSUED":
      return `Issued "${p.title}" to ${nameOf(p.user_id)}`;
    case "MEMBER_EXITED":
      return `Left the project after ${Math.round(Number(p.active_fraction ?? 1) * 100)}% of the milestone; credit kept, access revoked`;
    case "MILESTONE_REJECTED":
      return `Rejected "${p.milestone}", citing: ${p.criterion_cited}`;
    case "DISPUTE_RAISED":
      return `Disputed the rejection of "${p.milestone}"; ${rupees(p.escrow_frozen)} of escrow frozen`;
    case "DISPUTE_RESOLVED":
      return `Resolved the dispute in favour of the ${p.in_favour_of}; escrow unfrozen`;
    case "BRIEF_VIEWED":
      return "Viewed the confidential brief";
    default:
      return e.event.replaceAll("_", " ").toLowerCase();
  }
}

function evidenceOf(p: Record<string, unknown>): LedgerViewRow["evidence"] {
  const artefact = str(p.artefact);
  if (artefact) return { label: artefact, hash: str(p.artefact_hash) };
  const ref = str(p.payment_ref) ?? str(p.reference) ?? str(p.escrow_reference);
  return ref ? { label: ref, hash: null } : null;
}

export function toLedgerRows(entries: LedgerEntry[], names: Record<string, string>): LedgerViewRow[] {
  const nameOf = (id: unknown) => (typeof id === "string" && names[id]) || "someone";

  // What later entries say about earlier ones.
  const reviews = new Map<string, { verdict: string; impact: number; reviewer: string }>();
  const flagged = new Set<string>();
  const approvedDrafts = new Set<string>();
  for (const e of entries) {
    const p = e.payload;
    if (e.event === "REVIEW_DONE" && str(p.contribution_id)) {
      reviews.set(p.contribution_id as string, {
        verdict: String(p.verdict),
        impact: Number(p.impact),
        reviewer: nameOf(e.actor),
      });
    } else if (e.event === "SIMILARITY_FLAGGED" && str(p.contribution_id)) {
      flagged.add(p.contribution_id as string);
    } else if ((e.event === "AGENT_DRAFT_APPROVED" || e.event === "MILESTONES_APPROVED") && str(p.draft_id)) {
      approvedDrafts.add(p.draft_id as string);
    }
  }

  const verify = (e: LedgerEntry): LedgerViewRow["verification"] => {
    const p = e.payload;
    switch (e.event) {
      case "CONTRIBUTION_ADDED": {
        const id = p.contribution_id as string;
        if (flagged.has(id)) return { label: "Flagged: similarity", tone: "alert" };
        const review = reviews.get(id);
        if (review && review.verdict !== "approved") {
          return { label: `Not approved by ${review.reviewer}`, tone: "alert" };
        }
        if (review) return { label: `Reviewed by ${review.reviewer}, impact ${review.impact}`, tone: "verified" };
        return { label: "Awaiting review", tone: "pending" };
      }
      case "AGENT_ACTION":
        return approvedDrafts.has(p.draft_id as string)
          ? { label: "Approved by owner", tone: "verified" }
          : { label: "Draft, not approved", tone: "pending" };
      case "SIMILARITY_FLAGGED":
        return { label: "Flagged", tone: "alert" };
      case "REVIEW_DONE":
        return { label: "Expert review", tone: "verified" };
      case "ESCROW_FUNDED":
      case "PAYOUT_ISSUED":
        return { label: "Simulated payment", tone: "neutral" };
      default:
        return { label: "Recorded", tone: "neutral" };
    }
  };

  return entries.map((e) => {
    const isAgent = e.actor.startsWith("agent:");
    return {
      seq: e.seq,
      time: timeFormat.format(new Date(e.ts)),
      actorName: isAgent ? e.actor.slice("agent:".length) : nameOf(e.actor),
      isAgent,
      ownerName: isAgent ? nameOf(e.on_behalf_of) : null,
      event: e.event,
      action: describe(e, nameOf),
      evidence: evidenceOf(e.payload),
      // An agent's own output is all AI. The integrity check is a rule, not generated content.
      aiShare: numOf(e.payload.ai_share) ?? (isAgent && e.actor !== "agent:integrity" ? 1 : null),
      verification: verify(e),
      hash: e.hash,
      category: MONEY.has(e.event) ? "money" : REVIEW.has(e.event) ? "review" : "other",
    };
  });
}

/** Weights come from approved expert reviews in the ledger, never from commit counts. */
export function reviewedWeights(entries: LedgerEntry[], names: Record<string, string>): ReviewedWeight[] {
  // The AI share each contribution declared when it was added.
  const declared = new Map<string, number>();
  for (const e of entries) {
    if (e.event === "CONTRIBUTION_ADDED" && str(e.payload.contribution_id)) {
      declared.set(e.payload.contribution_id as string, Number(e.payload.ai_share ?? 0));
    }
  }

  const impact = new Map<string, number>();
  const aiImpact = new Map<string, number>();
  for (const e of entries) {
    if (e.event !== "REVIEW_DONE" || e.payload.verdict !== "approved") continue;
    const author = str(e.payload.author_id);
    if (!author) continue;
    const value = Number(e.payload.impact ?? 0);
    impact.set(author, (impact.get(author) ?? 0) + value);
    aiImpact.set(author, (aiImpact.get(author) ?? 0) + value * (declared.get(String(e.payload.contribution_id)) ?? 0));
  }
  const total = [...impact.values()].reduce((a, b) => a + b, 0);
  return [...impact]
    .map(([userId, value]) => ({
      userId,
      name: names[userId] ?? "someone",
      impact: value,
      weight: total > 0 ? value / total : 0,
      aiShare: value > 0 ? Math.round(((aiImpact.get(userId) ?? 0) / value) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.impact - a.impact);
}

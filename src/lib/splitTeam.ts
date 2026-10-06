// Pure rule for WHO is on a milestone's split: the people who had accepted the
// charter by the time the milestone was submitted. Someone who joins afterwards
// did not work on it and gets no share of it.
//
// "By the time" is decided by ledger order (seq), not by timestamps: the chain
// order is the one thing nobody can argue with.

export interface TeamLedgerEntry {
  seq: number;
  actor: string;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Returns the ids of the given members who belong on this milestone's split.
 * Before the milestone is submitted, that is everyone currently on the team.
 */
export function teamAtSubmission(memberIds: string[], milestoneId: string, entries: TeamLedgerEntry[]): string[] {
  const submissions = entries
    .filter((e) => e.event === "MILESTONE_SUBMITTED" && e.payload.milestone_id === milestoneId)
    .map((e) => e.seq);
  if (submissions.length === 0) return memberIds;
  const submittedAt = Math.max(...submissions);

  const joinedAt = new Map<string, number>();
  for (const e of entries) {
    if (e.event !== "CHARTER_ACCEPTED") continue;
    joinedAt.set(e.actor, Math.min(joinedAt.get(e.actor) ?? Infinity, e.seq));
  }
  // No acceptance entry at all should not happen; if it does, do not silently drop the person.
  return memberIds.filter((id) => (joinedAt.get(id) ?? -Infinity) < submittedAt);
}

// Pure helpers that explain "who can see what". The lock itself is enforced by
// the RLS policy on project_briefs (can_read_brief in 001_schema.sql); this
// mirrors that rule so the UI can say WHY the brief is locked and what to do.

export type CharterModel = "funded" | "stipend" | "knowledge_sharing" | "institutional_credit";
export type MemberRole = "sponsor" | "expert" | "student";
export type MembershipStatus = "invited" | "active" | "inactive" | "exited";

export interface ViewerMembership {
  role: MemberRole;
  status: MembershipStatus;
  /** The charter version this member accepted, if any. */
  charterVersion: number | null;
}

export interface BriefAccessInput {
  isSponsor: boolean;
  isAdmin: boolean;
  membership: ViewerMembership | null;
  latestCharterVersion: number | null;
}

export interface BriefAccess {
  unlocked: boolean;
  reason: string;
  /** True when accepting the latest charter would unlock the brief. */
  canAccept: boolean;
}

export const MODEL_LABELS: Record<CharterModel, string> = {
  funded: "Funded",
  stipend: "Stipend",
  knowledge_sharing: "Knowledge-sharing",
  institutional_credit: "Institutional credit",
};

export function isPaidModel(model: CharterModel): boolean {
  return model === "funded" || model === "stipend";
}

export function briefAccess(input: BriefAccessInput): BriefAccess {
  const { isSponsor, isAdmin, membership, latestCharterVersion: latest } = input;

  if (isSponsor) {
    return { unlocked: true, reason: "You are the sponsor of this project.", canAccept: false };
  }
  if (!membership) {
    return {
      unlocked: false,
      canAccept: false,
      reason: isAdmin
        ? "Admins audit the ledger but are not project members, so the brief stays locked."
        : "Only invited members who accept the charter can read the brief.",
    };
  }
  if (membership.status === "exited" || membership.status === "inactive") {
    return {
      unlocked: false,
      canAccept: false,
      reason:
        membership.status === "exited"
          ? "You have left this project. Access ended when you exited; your credit is kept."
          : "Your membership is inactive, so access is paused.",
    };
  }
  if (latest === null) {
    return { unlocked: false, canAccept: false, reason: "The sponsor has not published a charter yet." };
  }
  if (membership.status === "invited") {
    return {
      unlocked: false,
      canAccept: true,
      reason: `You are invited. Accept Charter v${latest} to unlock the brief.`,
    };
  }
  if (membership.charterVersion !== latest) {
    return {
      unlocked: false,
      canAccept: true,
      reason: `The charter changed to v${latest} (you accepted v${membership.charterVersion ?? "-"}). Re-accept to unlock the brief again.`,
    };
  }
  return { unlocked: true, reason: `You accepted Charter v${latest}.`, canAccept: false };
}

import { describe, expect, it } from "vitest";
import { briefAccess, type ViewerMembership } from "./access";

const member = (over: Partial<ViewerMembership> = {}): ViewerMembership => ({
  role: "student",
  status: "active",
  charterVersion: 1,
  ...over,
});

const base = { isSponsor: false, isAdmin: false, latestCharterVersion: 1 };

describe("briefAccess", () => {
  it("unlocks for the sponsor", () => {
    expect(briefAccess({ ...base, isSponsor: true, membership: null }).unlocked).toBe(true);
  });

  it("unlocks for an active member on the latest charter", () => {
    const access = briefAccess({ ...base, membership: member() });
    expect(access).toMatchObject({ unlocked: true, canAccept: false });
  });

  it("locks for a non-member with nothing to accept", () => {
    const access = briefAccess({ ...base, membership: null });
    expect(access).toMatchObject({ unlocked: false, canAccept: false });
  });

  it("locks for an admin who is not a member", () => {
    const access = briefAccess({ ...base, isAdmin: true, membership: null });
    expect(access.unlocked).toBe(false);
    expect(access.reason).toMatch(/Admins/);
  });

  it("lets an invited member accept", () => {
    const access = briefAccess({ ...base, membership: member({ status: "invited", charterVersion: null }) });
    expect(access).toMatchObject({ unlocked: false, canAccept: true });
  });

  it("re-locks when a new charter version is published", () => {
    const access = briefAccess({ ...base, latestCharterVersion: 2, membership: member() });
    expect(access).toMatchObject({ unlocked: false, canAccept: true });
    expect(access.reason).toMatch(/v2/);
  });

  it("stays locked after a member exits", () => {
    const access = briefAccess({ ...base, membership: member({ status: "exited" }) });
    expect(access).toMatchObject({ unlocked: false, canAccept: false });
  });
});

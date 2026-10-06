import { describe, expect, it } from "vitest";
import { teamAtSubmission, type TeamLedgerEntry } from "./splitTeam";

const accepted = (seq: number, actor: string): TeamLedgerEntry => ({ seq, actor, event: "CHARTER_ACCEPTED", payload: {} });
const submitted = (seq: number, milestone: string): TeamLedgerEntry => ({
  seq, actor: "priya", event: "MILESTONE_SUBMITTED", payload: { milestone_id: milestone },
});

describe("teamAtSubmission", () => {
  const entries = [accepted(10, "priya"), accepted(11, "arjun"), submitted(30, "m1"), accepted(54, "dev")];

  it("leaves out someone who joined after the milestone was submitted", () => {
    expect(teamAtSubmission(["priya", "arjun", "dev"], "m1", entries)).toEqual(["priya", "arjun"]);
  });

  it("includes everyone while the milestone is not submitted yet", () => {
    expect(teamAtSubmission(["priya", "arjun", "dev"], "m2", entries)).toEqual(["priya", "arjun", "dev"]);
  });

  it("uses the latest submission after a rejection and resubmission", () => {
    const again = [...entries, submitted(70, "m1")];
    expect(teamAtSubmission(["priya", "arjun", "dev"], "m1", again)).toEqual(["priya", "arjun", "dev"]);
  });

  it("counts from the first acceptance when someone re-accepts a new charter version", () => {
    const reaccepted = [...entries, accepted(60, "priya")];
    expect(teamAtSubmission(["priya"], "m1", reaccepted)).toEqual(["priya"]);
  });

  it("does not drop a member who has no acceptance entry", () => {
    expect(teamAtSubmission(["ghost"], "m1", entries)).toEqual(["ghost"]);
  });
});

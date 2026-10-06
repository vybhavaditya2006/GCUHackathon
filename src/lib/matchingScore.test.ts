import { describe, expect, it } from "vitest";
import { rankCandidates, scoreCandidate, templateReason, type CandidateProfile, type MatchProject } from "./matchingScore";

const project: MatchProject = {
  requiredSkills: ["CNN", "Medical imaging", "TensorFlow Lite", "Model quantisation", "Dataset curation"],
  competitors: ["OptiScan AI"],
  hoursPerWeek: 10,
  paid: true,
  minorsNeedGuardianConsent: true,
  topicText: "Low-cost detection of diabetic retinopathy from fundus images on edge devices. Medical imaging.",
};

const person = (over: Partial<CandidateProfile> & Pick<CandidateProfile, "id" | "name">): CandidateProfile => ({
  role: "student",
  organisation: null,
  verified: true,
  skills: ["CNN"],
  provenSkills: [],
  completedProjects: 0,
  interests: [],
  hoursPerWeek: 12,
  affiliations: [],
  isMinor: false,
  guardianConsent: false,
  activeProjects: 0,
  membership: null,
  ...over,
});

const priya = person({
  id: "priya", name: "Priya Nair", skills: ["CNN", "Medical imaging", "Dataset curation", "Python"],
  provenSkills: ["Medical imaging", "CNN"], completedProjects: 2, interests: ["Medical imaging", "Computer vision"],
});

describe("hard filters", () => {
  const reason = (over: Partial<CandidateProfile>) =>
    scoreCandidate(person({ id: "x", name: "X", ...over }), project).excludedReason;

  it("passes a clean candidate", () => expect(reason({})).toBeNull());
  it("removes the unverified", () => expect(reason({ verified: false })).toMatch(/Not verified/));
  it("removes a competitor affiliation", () =>
    expect(reason({ affiliations: ["optiscan ai"] })).toMatch(/Conflict of interest/));
  it("removes a minor without consent on paid work only", () => {
    expect(reason({ isMinor: true })).toMatch(/guardian consent/);
    expect(reason({ isMinor: true, guardianConsent: true })).toBeNull();
    expect(scoreCandidate(person({ id: "x", name: "X", isMinor: true }), { ...project, paid: false }).excludedReason).toBeNull();
  });
  it("removes too few hours, too many projects and no skill", () => {
    expect(reason({ hoursPerWeek: 4 })).toMatch(/4 h\/week/);
    expect(reason({ activeProjects: 2 })).toMatch(/2 active projects/);
    expect(reason({ skills: ["Cooking"] })).toMatch(/None of the required skills/);
  });
});

describe("score", () => {
  it("adds up to the breakdown and never exceeds 100", () => {
    const c = scoreCandidate(priya, project);
    // skills: 2 proven + 1 declared (0.6) of 5 = 2.6/5 x 40 = 20.8 -> 21; record 2/3 x 20 -> 13;
    // topic 1 of 2 -> 8 (7.5 rounds up); availability 12/12 -> 15; not a newcomer -> 0.
    expect(c.breakdown).toEqual({ skills: 21, trackRecord: 13, topicFit: 8, availability: 15, newcomer: 0 });
    expect(c.score).toBe(57);
    expect(c.score).toBeLessThanOrEqual(100);
  });

  it("counts a proven skill for more than a declared one", () => {
    const declared = scoreCandidate(person({ id: "a", name: "A", skills: ["CNN"] }), project);
    const proven = scoreCandidate(person({ id: "b", name: "B", skills: ["CNN"], provenSkills: ["CNN"] }), project);
    expect(proven.breakdown.skills).toBeGreaterThan(declared.breakdown.skills);
  });

  it("gives newcomers the boost", () => {
    expect(scoreCandidate(person({ id: "n", name: "N" }), project).breakdown.newcomer).toBe(10);
  });
});

describe("rankCandidates", () => {
  it("shortlists the top five per role and lists the rest with a reason", () => {
    const students = Array.from({ length: 7 }, (_, i) => person({ id: `s${i}`, name: `Student ${i}`, completedProjects: i }));
    const rohan = person({ id: "rohan", name: "Rohan Das", affiliations: ["OptiScan AI"] });
    const expert = person({ id: "kiran", name: "Dr. Kiran Shetty", role: "expert", completedProjects: 6 });
    const { shortlisted, excluded } = rankCandidates([...students, rohan, expert, priya], project);

    expect(shortlisted.filter((c) => c.role === "student")).toHaveLength(5);
    expect(shortlisted[0].name).toBe("Dr. Kiran Shetty"); // experts are listed first
    expect(shortlisted.filter((c) => c.role === "student")[0].name).toBe("Priya Nair");
    expect(excluded.map((c) => c.name)).toEqual(["Rohan Das"]);
  });

  it("writes a reason from the breakdown without the LLM", () => {
    expect(templateReason(scoreCandidate(priya, project))).toBe(
      "Priya Nair matches CNN, Medical imaging, Dataset curation (CNN, Medical imaging proven by reviewed work), with 2 completed projects and 12 h/week available.",
    );
  });
});

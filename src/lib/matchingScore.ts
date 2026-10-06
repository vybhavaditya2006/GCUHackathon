// Pure matching rules: hard filters, then a score out of 100. No I/O and no LLM.
// The LLM only explains these numbers afterwards; it never changes them.

export interface CandidateProfile {
  id: string;
  name: string;
  role: "student" | "expert";
  organisation: string | null;
  verified: boolean;
  skills: string[];
  /** Skills backed by reviewed work in the ledger. They count more. */
  provenSkills: string[];
  completedProjects: number;
  interests: string[];
  hoursPerWeek: number;
  affiliations: string[];
  isMinor: boolean;
  guardianConsent: boolean;
  /** Projects this person is currently active on. */
  activeProjects: number;
  /** Their membership status on THIS project, if any. */
  membership: string | null;
}

export interface MatchProject {
  requiredSkills: string[];
  /** The sponsor's declared competitors (conflict-of-interest filter). */
  competitors: string[];
  hoursPerWeek: number;
  paid: boolean;
  minorsNeedGuardianConsent: boolean;
  /** Title + summary, used for topic fit. */
  topicText: string;
}

export interface ScoreBreakdown {
  skills: number; // of 40
  trackRecord: number; // of 20
  topicFit: number; // of 15
  availability: number; // of 15
  newcomer: number; // of 10
}

export interface Candidate {
  id: string;
  name: string;
  role: "student" | "expert";
  organisation: string | null;
  /** Null when the candidate passed every hard filter. */
  excludedReason: string | null;
  score: number;
  breakdown: ScoreBreakdown;
  matchedSkills: string[];
  provenMatched: string[];
  hoursPerWeek: number;
  completedProjects: number;
  membership: string | null;
  reason?: string;
}

export const MAX_ACTIVE_PROJECTS = 2;
export const TOP_PER_ROLE = 5;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const has = (list: string[], item: string) => list.some((x) => same(x, item));

function excludedReason(c: CandidateProfile, p: MatchProject, matched: string[]): string | null {
  if (!c.verified) return "Not verified yet";
  if (c.isMinor && p.paid && p.minorsNeedGuardianConsent && !c.guardianConsent) {
    return "Under 18 without guardian consent (required for paid work)";
  }
  const conflict = c.affiliations.find((a) => has(p.competitors, a));
  if (conflict) return `Conflict of interest: affiliated with ${conflict}, a declared competitor`;
  if (c.hoursPerWeek < p.hoursPerWeek) {
    return `Has ${c.hoursPerWeek} h/week; the project needs ${p.hoursPerWeek}`;
  }
  if (c.activeProjects >= MAX_ACTIVE_PROJECTS && c.membership !== "active") {
    return `Already on ${c.activeProjects} active projects`;
  }
  if (matched.length === 0) return "None of the required skills";
  return null;
}

export function scoreCandidate(c: CandidateProfile, p: MatchProject): Candidate {
  const matchedSkills = p.requiredSkills.filter((s) => has(c.skills, s) || has(c.provenSkills, s));
  const provenMatched = matchedSkills.filter((s) => has(c.provenSkills, s));

  // A ledger-proven skill counts fully, a self-declared one 60%.
  const skillPoints = provenMatched.length + (matchedSkills.length - provenMatched.length) * 0.6;
  const skills = p.requiredSkills.length ? (skillPoints / p.requiredSkills.length) * 40 : 0;
  const trackRecord = (Math.min(c.completedProjects, 3) / 3) * 20;
  const topic = p.topicText.toLowerCase();
  const onTopic = c.interests.filter((i) => topic.includes(i.trim().toLowerCase()) || has(p.requiredSkills, i)).length;
  const topicFit = (Math.min(onTopic, 2) / 2) * 15;
  const availability = p.hoursPerWeek > 0 ? Math.min(1, c.hoursPerWeek / (p.hoursPerWeek * 1.2)) * 15 : 15;
  // A first project is hard to get without a record, so newcomers get a head start.
  const newcomer = c.completedProjects === 0 ? 10 : 0;

  const breakdown: ScoreBreakdown = {
    skills: Math.round(skills),
    trackRecord: Math.round(trackRecord),
    topicFit: Math.round(topicFit),
    availability: Math.round(availability),
    newcomer,
  };

  return {
    id: c.id,
    name: c.name,
    role: c.role,
    organisation: c.organisation,
    excludedReason: excludedReason(c, p, matchedSkills),
    score: Object.values(breakdown).reduce((a, b) => a + b, 0),
    breakdown,
    matchedSkills,
    provenMatched,
    hoursPerWeek: c.hoursPerWeek,
    completedProjects: c.completedProjects,
    membership: c.membership,
  };
}

export interface Ranking {
  /** Top candidates per role, best first. */
  shortlisted: Candidate[];
  /** Everyone a hard filter removed, with the reason. */
  excluded: Candidate[];
}

export function rankCandidates(profiles: CandidateProfile[], project: MatchProject): Ranking {
  const scored = profiles.map((c) => scoreCandidate(c, project));
  const eligible = scored
    .filter((c) => c.excludedReason === null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = (role: Candidate["role"]) => eligible.filter((c) => c.role === role).slice(0, TOP_PER_ROLE);
  return {
    shortlisted: [...top("expert"), ...top("student")],
    excluded: scored.filter((c) => c.excludedReason !== null).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A fixed-wording reason, used when the LLM is unavailable. Built from the same breakdown. */
export function templateReason(c: Candidate): string {
  const skills = c.matchedSkills.length
    ? `matches ${c.matchedSkills.join(", ")}${c.provenMatched.length ? ` (${c.provenMatched.join(", ")} proven by reviewed work)` : ""}`
    : "matches no required skill";
  const record = c.completedProjects > 0 ? `${c.completedProjects} completed project${c.completedProjects === 1 ? "" : "s"}` : "a newcomer boost";
  return `${c.name} ${skills}, with ${record} and ${c.hoursPerWeek} h/week available.`;
}

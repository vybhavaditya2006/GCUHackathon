import { Pill } from "@/components/Pill";
import { PostButton } from "@/components/PostButton";
import type { Candidate } from "@/lib/matchingScore";

const parts: { key: keyof Candidate["breakdown"]; label: string; max: number }[] = [
  { key: "skills", label: "Skills", max: 40 },
  { key: "trackRecord", label: "Record", max: 20 },
  { key: "topicFit", label: "Topic", max: 15 },
  { key: "availability", label: "Hours", max: 15 },
  { key: "newcomer", label: "Newcomer", max: 10 },
];

/** Ranked candidates with score bars and the "why"; filtered-out people are greyed with the reason. */
export function MatchTable({
  projectId,
  shortlisted,
  excluded,
  canInvite,
}: {
  projectId: string;
  shortlisted: Candidate[];
  excluded: Candidate[];
  canInvite: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            {["Candidate", "Score / 100", "Breakdown", "Why", ""].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shortlisted.map((c) => (
            <tr key={c.id} className="align-top">
              <td className="px-3 py-3">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground capitalize">
                  {c.role}
                  {c.organisation ? ` · ${c.organisation}` : ""}
                </span>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 font-semibold tabular-nums">{c.score}</span>
                  <span className="h-2 w-24 rounded-full bg-secondary">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${c.score}%` }} />
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">
                {parts.map((p) => (
                  <span key={p.key} className="mr-2 whitespace-nowrap">
                    {p.label} {c.breakdown[p.key]}/{p.max}
                  </span>
                ))}
                {c.provenMatched.length > 0 && (
                  <span className="mt-1 block text-verified">Proven by reviewed work: {c.provenMatched.join(", ")}</span>
                )}
              </td>
              <td className="max-w-xs px-3 py-3">{c.reason}</td>
              <td className="px-3 py-3">
                {c.membership ? (
                  <Pill tone={c.membership === "active" ? "verified" : "pending"} className="capitalize">
                    {c.membership === "active" ? "On the team" : c.membership}
                  </Pill>
                ) : canInvite ? (
                  <PostButton
                    url={`/api/projects/${projectId}/invite`}
                    body={{ userId: c.id, role: c.role }}
                    label="Invite"
                    busyLabel="Inviting..."
                  />
                ) : null}
              </td>
            </tr>
          ))}
          {excluded.map((c) => (
            <tr key={c.id} className="align-top bg-secondary/50 text-muted-foreground">
              <td className="px-3 py-3">
                {c.name}
                <span className="block text-xs capitalize">{c.role}</span>
              </td>
              <td className="px-3 py-3 text-xs">Not scored</td>
              <td className="px-3 py-3" colSpan={2}>
                <Pill tone="alert">Filtered out</Pill> <span className="ml-1">{c.excludedReason}</span>
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

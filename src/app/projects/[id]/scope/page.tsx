import { notFound } from "next/navigation";
import { JudgeNote } from "@/components/JudgeNote";
import { MatchTable } from "@/components/MatchTable";
import { Pill } from "@/components/Pill";
import { PostButton } from "@/components/PostButton";
import { userDb } from "@/lib/db";
import type { Candidate } from "@/lib/matchingScore";
import { getProjectView } from "@/lib/projects";

interface ScopeMilestone {
  title: string;
  weeks?: number;
  requiredSkills?: string[];
  acceptanceCriteria?: string;
}

export default async function ScopePage({ params }: PageProps<"/projects/[id]/scope">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();
  const { user, isSponsor } = view;
  const isAdmin = user.role === "admin";

  // Read with the user's own session: RLS shows an agent draft only to its owner and admins,
  // and the ledger only to project members and admins.
  const db = await userDb();
  const [draftRes, matchRes] = await Promise.all([
    db
      .from("agent_drafts")
      .select("id, owner_id, output, model, tokens_in, tokens_out, cost, status, created_at")
      .eq("project_id", id)
      .eq("agent", "scoping")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("ledger")
      .select("seq, payload, on_behalf_of")
      .eq("project_id", id)
      .eq("event", "MATCH_RUN")
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const draft = draftRes.data;
  const scope = (draft?.output ?? {}) as { milestones?: ScopeMilestone[]; team?: string };
  const match = matchRes.data;
  const payload = (match?.payload ?? {}) as {
    candidates?: Candidate[];
    shortlisted?: string[];
    excluded?: { name: string; reason: string }[];
    explained_by_llm?: boolean;
  };
  const candidates = payload.candidates ?? [];
  const shortlisted = candidates.filter((c) => c.excludedReason === null);
  const excluded = candidates.filter((c) => c.excludedReason !== null);

  // Membership can change after a run (an invite, an acceptance), so show the live status.
  let live = new Map<string, string>();
  if (candidates.length && (isSponsor || isAdmin || view.membership?.status === "active")) {
    const { data } = await db.from("memberships").select("user_id, status").eq("project_id", id);
    live = new Map((data ?? []).map((m) => [m.user_id, m.status]));
  }
  const withLive = (list: Candidate[]) => list.map((c) => ({ ...c, membership: live.get(c.id) ?? null }));

  const card = "rounded-lg border border-border bg-card p-5";

  return (
    <>
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">2 · AI Scoping &amp; Matching</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">The AI proposes, a human decides</h1>
      </div>

      <JudgeNote>
        Both agents only draft. The scoping proposal does nothing until the sponsor approves it. Matching is ranked
        by a fixed, published rule; the language model only writes the one-line reason, from the score breakdown
        and nothing else. Every run is in the ledger under the human who owns it.
      </JudgeNote>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Scoping agent proposal</h2>
            <Pill tone="ai">Scoping agent · owned by {view.project.sponsor?.full_name ?? "the sponsor"}</Pill>
            {draft && (
              <Pill tone={draft.status === "approved" ? "verified" : "pending"} className="capitalize">
                {draft.status === "approved" ? "Approved by the sponsor" : `Draft: ${draft.status}`}
              </Pill>
            )}
          </div>
          {isSponsor && (
            <div className="flex flex-wrap items-start gap-2">
              <PostButton url={`/api/projects/${id}/scoping`} label="Run the scoping agent" busyLabel="Drafting..." />
              {draft?.status === "pending" && (
                <PostButton
                  url={`/api/agent-drafts/${draft.id}/approve-scope`}
                  label="Approve this scope"
                  busyLabel="Approving..."
                  tone="money"
                />
              )}
            </div>
          )}
        </div>

        {draft ? (
          <>
            <ol className="mt-4 flex flex-col divide-y divide-border text-sm">
              {(scope.milestones ?? []).map((m, i) => (
                <li key={m.title} className="py-2.5 first:pt-0">
                  <span className="font-medium">
                    {i + 1}. {m.title}
                  </span>
                  {m.weeks !== undefined && <span className="ml-2 text-xs text-muted-foreground">{m.weeks} weeks</span>}
                  {m.acceptanceCriteria && (
                    <span className="block text-xs text-muted-foreground">Accepted when: {m.acceptanceCriteria}</span>
                  )}
                  {m.requiredSkills && m.requiredSkills.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.requiredSkills.map((s) => (
                        <Pill key={s}>{s}</Pill>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {scope.team && <p className="mt-3 text-sm">Team: {scope.team}</p>}
            <p className="mt-3 text-xs text-muted-foreground">
              Model {draft.model} · {draft.tokens_in + draft.tokens_out} tokens · ₹{Number(draft.cost).toFixed(2)} from
              the AI reserve (simulated price). Milestones are created from a proposal only when the project has none.
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {isSponsor
              ? "No proposal yet. Run the agent to draft milestones from the summary and the brief."
              : "An agent's draft is visible only to the human who owns it (here, the sponsor) and to admins."}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Candidates</h2>
            {match && <Pill>Ledger #{match.seq}</Pill>}
            {match && payload.explained_by_llm === false && candidates.length > 0 && (
              <Pill tone="pending">Reasons from the fixed template (LLM unavailable)</Pill>
            )}
          </div>
          {(isSponsor || isAdmin) && (
            <PostButton url={`/api/projects/${id}/matching`} label="Run matching" busyLabel="Matching..." />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Hard filters first: verified, eligible under the charter, no conflict of interest, enough hours, fewer than
          2 active projects, at least one required skill. Then a score out of 100: skills 40 (skills proven by
          reviewed work count more), track record 20, topic fit 15, availability 15, newcomer boost 10. Top 5 per
          role. A human invites, and the candidate must accept the charter.
        </p>

        {candidates.length > 0 ? (
          <MatchTable projectId={id} shortlisted={withLive(shortlisted)} excluded={excluded} canInvite={isSponsor} />
        ) : match ? (
          <div className={`${card} text-sm`}>
            <p>Shortlisted: {(payload.shortlisted ?? []).join(", ")}</p>
            {(payload.excluded ?? []).map((e) => (
              <p key={e.name} className="mt-1 text-muted-foreground">
                <Pill tone="alert">Filtered out</Pill> {e.name}: {e.reason.replaceAll("_", " ")}
              </p>
            ))}
            <p className="mt-3 text-xs text-muted-foreground">
              This is the seeded run from 5 Oct. Run matching again to see scores and reasons.
            </p>
          </div>
        ) : (
          <p className={`${card} text-sm text-muted-foreground`}>
            {isSponsor || isAdmin
              ? "No matching run yet."
              : "Matching results are in the project ledger, which only members and admins can read."}
          </p>
        )}
      </section>
    </>
  );
}

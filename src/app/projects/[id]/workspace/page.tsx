import { notFound } from "next/navigation";
import { JudgeNote } from "@/components/JudgeNote";
import { Pill, type PillTone } from "@/components/Pill";
import { PostButton } from "@/components/PostButton";
import { ReviewForm } from "@/components/ReviewForm";
import { UploadContributionForm } from "@/components/UploadContributionForm";
import { isPaidModel } from "@/lib/access";
import { userDb } from "@/lib/db";
import { formatRupees } from "@/lib/engine/computeSplit";
import { formatDate } from "@/lib/format";
import { SIMILARITY_THRESHOLD } from "@/lib/integrity";
import { getProjectView } from "@/lib/projects";

interface TeamRow {
  user_id: string;
  role: "sponsor" | "expert" | "student";
  status: string;
  is_lead: boolean;
  active_fraction: number;
}

interface ContributionRow {
  id: string;
  milestone_id: string;
  author_id: string;
  title: string;
  agent_used: string | null;
  ai_share: number;
  artefact_name: string;
  artefact_hash: string;
  similarity: number;
  flagged: boolean;
  ai_declaration: string;
  reviews: { verdict: string; impact: number; notes: string }[];
}

const statusTone: Record<string, PillTone> = {
  draft: "neutral",
  funded: "ai",
  submitted: "pending",
  accepted: "verified",
  rejected: "alert",
  disputed: "alert",
};

// Who can see what, as enforced by the RLS policies in 001_schema.sql.
const matrix: { what: string; sponsor: string; member: string; invited: string; admin: string; outsider: string }[] = [
  { what: "Public summary and charter", sponsor: "Yes", member: "Yes", invited: "Yes", admin: "Yes", outsider: "Yes" },
  { what: "Confidential brief", sponsor: "Yes", member: "After accepting", invited: "No", admin: "No", outsider: "No" },
  { what: "Documents and reviews", sponsor: "Yes", member: "Yes", invited: "No", admin: "Yes", outsider: "No" },
  { what: "Ledger", sponsor: "Yes", member: "Yes", invited: "No", admin: "Yes", outsider: "No" },
  { what: "Payouts and receipts", sponsor: "Yes", member: "Yes", invited: "No", admin: "Yes", outsider: "No" },
  { what: "An agent's draft", sponsor: "Own", member: "Own", invited: "No", admin: "Yes", outsider: "No" },
];

const agents = [
  { name: "Scoping agent", owner: "sponsor" },
  { name: "Research / Coding agent", owner: "the student who runs it" },
  { name: "Review agent", owner: "expert" },
];

export default async function WorkspacePage({ params }: PageProps<"/projects/[id]/workspace">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();
  const { user, charter, membership, isSponsor, milestones } = view;

  const heading = (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">3 · Workspace</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Work, review and escrow in one place</h1>
    </div>
  );

  const activeMember = membership?.status === "active";
  if (!isSponsor && !activeMember && user.role !== "admin") {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          The workspace is open to the sponsor and to members who accepted the charter. {view.access.reason}
        </p>
      </>
    );
  }

  // All reads use the user's own session, so RLS decides what comes back.
  const db = await userDb();
  const [teamRes, escrowRes, contributionsRes] = await Promise.all([
    db.from("memberships").select("user_id, role, status, is_lead, active_fraction").eq("project_id", id).order("invited_at"),
    db.from("escrows").select("milestone_id, amount, status, reference").eq("project_id", id),
    db
      .from("contributions")
      .select(
        "id, milestone_id, author_id, title, agent_used, ai_share, artefact_name, artefact_hash, similarity, flagged, ai_declaration, reviews(verdict, impact, notes)",
      )
      .eq("project_id", id)
      .order("created_at"),
  ]);
  const team = (teamRes.data ?? []) as TeamRow[];
  const escrows = escrowRes.data ?? [];
  const contributions = (contributionsRes.data ?? []) as ContributionRow[];

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set([...team.map((t) => t.user_id), ...contributions.map((c) => c.author_id)])]);
  const nameOf = (uid: string) => profiles?.find((p) => p.id === uid)?.full_name ?? "someone";
  const ownerName = (role: string) => {
    const person = team.find((t) => t.role === role && t.status === "active");
    return person ? nameOf(person.user_id) : role;
  };

  const paid = charter ? isPaidModel(charter.model) : false;
  const onCurrentCharter = activeMember && membership.charterVersion === charter?.version;
  const openForWork = (status: string) => status === "funded" || status === "rejected" || (status === "draft" && !paid);
  const openMilestones = milestones.filter((m) => openForWork(m.status));
  const canUpload = onCurrentCharter && membership.role === "student" && openMilestones.length > 0;
  const canReview = onCurrentCharter && membership.role === "expert";
  const canSubmit = onCurrentCharter && (membership.isLead || membership.role === "expert");

  const held = escrows.filter((e) => e.status === "funded").reduce((sum, e) => sum + Number(e.amount), 0);
  const released = escrows.filter((e) => e.status === "released").reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <>
      {heading}

      <JudgeNote>
        Every button here calls one database function that makes the change and writes its ledger entry in the same
        transaction. Uploads are fingerprinted and need an AI-use declaration; a copied file is flagged for a human,
        never silently blocked. Only work an expert approved earns weight.
      </JudgeNote>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="font-semibold">Escrow (simulated)</span>
        {paid ? (
          <>
            <span>
              Held: <span className="font-semibold text-verified">{formatRupees(held)}</span>
            </span>
            <span>Released: {formatRupees(released)}</span>
            {escrows.map((e) => (
              <span key={e.milestone_id} className="font-mono text-xs text-muted-foreground">
                {e.reference} · {e.status}
              </span>
            ))}
          </>
        ) : (
          <span className="text-muted-foreground">Not used: this project pays in credit and credentials, not money.</span>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Team</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {team.map((t) => (
              <li key={t.user_id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{nameOf(t.user_id)}</span>
                <Pill className="capitalize">
                  {t.role}
                  {t.is_lead ? " (lead)" : ""}
                </Pill>
                {t.status !== "active" && (
                  <Pill tone="pending" className="capitalize">
                    {t.status}
                  </Pill>
                )}
                {Number(t.active_fraction) < 1 && (
                  <Pill tone="pending">active {Math.round(Number(t.active_fraction) * 100)}%</Pill>
                )}
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-xs font-medium text-muted-foreground">AI agents (drafts only; a human approves)</h3>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {agents.map((a) => (
              <li key={a.name} className="flex flex-wrap items-center gap-2">
                <Pill tone="ai">{a.name}</Pill>
                <span className="text-xs text-muted-foreground">
                  owned by {a.owner === "sponsor" || a.owner === "expert" ? ownerName(a.owner) : a.owner}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Milestones</h2>
          <ol className="mt-3 flex flex-col divide-y divide-border text-sm">
            {milestones.map((m) => {
              const mine = contributions.filter((c) => c.milestone_id === m.id);
              const approved = mine.filter((c) => c.reviews.some((r) => r.verdict === "approved")).length;
              return (
                <li key={m.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {m.position}. {m.title}
                    </span>
                    <Pill tone={statusTone[m.status]} className="capitalize">
                      {m.status}
                    </Pill>
                    {m.amount > 0 && <span className="font-medium text-verified">{formatRupees(m.amount)}</span>}
                    <span className="text-xs text-muted-foreground">due {formatDate(m.due_date)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Accepted when: {m.acceptance_criteria} · {mine.length} contribution{mine.length === 1 ? "" : "s"},{" "}
                    {approved} approved
                  </p>
                  {isSponsor && paid && m.status === "draft" && m.amount > 0 && (
                    <PostButton
                      url={`/api/milestones/${m.id}/fund`}
                      label={`Fund ${formatRupees(m.amount)} into escrow`}
                      busyLabel="Funding..."
                      tone="money"
                    />
                  )}
                  {canSubmit && openForWork(m.status) && approved > 0 && (
                    <PostButton
                      url={`/api/milestones/${m.id}/submit`}
                      label="Submit milestone to the sponsor"
                      busyLabel="Submitting..."
                    />
                  )}
                  {m.status === "draft" && paid && !isSponsor && (
                    <p className="text-xs text-pending">Work starts once the sponsor funds this milestone.</p>
                  )}
                  {m.status === "submitted" && (
                    <p className="text-xs text-pending">
                      Waiting for the sponsor. Accepting it on Credit &amp; Payment runs the charter.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Documents</h2>
          <Pill>Team only: sponsor and active members</Pill>
        </div>
        <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
          {contributions.map((c) => {
            const review = c.reviews[0];
            const milestone = milestones.find((m) => m.id === c.milestone_id);
            return (
              <li key={c.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.title}</span>
                  <span className="font-mono text-xs text-muted-foreground" title={c.artefact_hash}>
                    {c.artefact_name} · sha256 {c.artefact_hash.slice(0, 8)}…
                  </span>
                  {Number(c.ai_share) > 0 && (
                    <Pill tone="ai">
                      {Math.round(Number(c.ai_share) * 100)}% AI ({c.agent_used} agent)
                    </Pill>
                  )}
                  {c.flagged ? (
                    <Pill tone="alert">Flagged: {Math.round(Number(c.similarity) * 100)}% similar</Pill>
                  ) : (
                    <Pill>Similarity {Math.round(Number(c.similarity) * 100)}%</Pill>
                  )}
                  {review ? (
                    <Pill tone={review.verdict === "approved" ? "verified" : "alert"}>
                      {review.verdict === "approved" ? `Approved, impact ${review.impact}` : review.verdict.replace("_", " ")}
                    </Pill>
                  ) : (
                    <Pill tone="pending">Awaiting review</Pill>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {nameOf(c.author_id)} · Milestone {milestone?.position} · AI-use declaration: {c.ai_declaration}
                  {review?.notes ? ` · Reviewer: ${review.notes}` : ""}
                </p>
                {canReview && !review && milestone && openForWork(milestone.status) && (
                  <ReviewForm contributionId={c.id} />
                )}
              </li>
            );
          })}
          {contributions.length === 0 && <li className="text-muted-foreground">No contributions yet.</li>}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Flag threshold: {Math.round(SIMILARITY_THRESHOLD * 100)}% similarity. A flag asks an expert to look; it does
          not decide anything by itself.
        </p>
      </section>

      {onCurrentCharter && membership.role === "student" && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Add a contribution</h2>
          {canUpload ? (
            <div className="mt-3">
              <UploadContributionForm
                milestones={openMilestones.map((m) => ({ id: m.id, label: `${m.position}. ${m.title}` }))}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No milestone is open for work right now: each one is either waiting to be funded or already submitted.
            </p>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Who can see what</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                {["", "Sponsor", "Active member", "Invited", "Admin", "Outsider"].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {matrix.map((row) => (
                <tr key={row.what}>
                  <td className="px-2 py-2 font-medium">{row.what}</td>
                  {[row.sponsor, row.member, row.invited, row.admin, row.outsider].map((cell, i) => (
                    <td key={i} className={`px-2 py-2 ${cell === "No" ? "text-alert" : cell === "Yes" ? "text-verified" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Enforced by row-level security in the database, not by this page. Access ends the moment a member exits.
        </p>
      </section>
    </>
  );
}

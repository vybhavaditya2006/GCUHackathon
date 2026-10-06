import Link from "next/link";
import { notFound } from "next/navigation";
import { JudgeNote } from "@/components/JudgeNote";
import { Pill, type PillTone } from "@/components/Pill";
import { isPaidModel, MODEL_LABELS } from "@/lib/access";
import { storedArtefacts } from "@/lib/artefacts";
import { userDb } from "@/lib/db";
import { formatRupees } from "@/lib/engine/computeSplit";
import { formatDate } from "@/lib/format";
import { verify } from "@/lib/ledger";
import { toLedgerRows, type LedgerEntry } from "@/lib/ledgerView";
import { getProjectView, isUuid } from "@/lib/projects";

interface ContributionRow {
  id: string;
  milestone_id: string;
  title: string;
  artefact_name: string;
  artefact_hash: string;
  version: number;
  builds_on: string | null;
  author_id: string;
  ai_share: number;
  flagged: boolean;
  reviews: { verdict: string; impact: number }[];
}

// The entries that tell the project's story on one screen.
const KEY_EVENTS = new Set([
  "PROJECT_POSTED", "CHARTER_PUBLISHED", "MILESTONES_APPROVED", "ESCROW_FUNDED", "SIMILARITY_FLAGGED",
  "MILESTONE_SUBMITTED", "MILESTONE_REJECTED", "DISPUTE_RAISED", "DISPUTE_RESOLVED", "MEMBER_EXITED",
  "MILESTONE_ACCEPTED",
]);

const statusTone: Record<string, PillTone> = {
  draft: "neutral",
  funded: "ai",
  submitted: "pending",
  accepted: "verified",
  rejected: "alert",
  disputed: "alert",
};

export default async function RecordPage({ params }: PageProps<"/projects/[id]/record">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();
  const { user, project, charter, membership, isSponsor, milestones } = view;

  const heading = (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">6 · Final record</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">What happened, who did it, and what they got</h1>
    </div>
  );

  if (!isSponsor && membership?.status !== "active" && user.role !== "admin") {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          The final record is visible to the project team and platform admins. You are not on this project&apos;s team.
        </p>
      </>
    );
  }

  // Read with the user's own session, so RLS decides what comes back.
  const db = await userDb();
  const [contributionsRes, ledgerRes, escrowRes, chain, stored] = await Promise.all([
    db
      .from("contributions")
      .select("id, milestone_id, title, artefact_name, artefact_hash, version, builds_on, author_id, ai_share, flagged, reviews(verdict, impact)")
      .eq("project_id", id)
      .order("created_at"),
    db.from("ledger").select("seq, ts, actor, on_behalf_of, event, payload, hash").eq("project_id", id).order("seq"),
    db.from("escrows").select("amount, status, reference").eq("project_id", id),
    verify(),
    storedArtefacts(id),
  ]);
  const contributions = (contributionsRes.data ?? []) as ContributionRow[];
  const ledger = (ledgerRes.data ?? []) as LedgerEntry[];
  const escrows = escrowRes.data ?? [];

  const credentials = ledger.filter((e) => e.event === "CREDENTIAL_ISSUED");
  const payouts = ledger.filter((e) => e.event === "PAYOUT_ISSUED");
  const ids = new Set<string>(contributions.map((c) => c.author_id));
  for (const e of ledger) {
    for (const value of [e.actor, e.on_behalf_of, e.payload.user_id, e.payload.author_id]) {
      if (typeof value === "string" && isUuid(value)) ids.add(value);
    }
  }
  const { data: profiles } = ids.size
    ? await db.from("profiles").select("id, full_name").in("id", [...ids])
    : { data: [] };
  const nameOf = (uid: unknown) => profiles?.find((p) => p.id === uid)?.full_name ?? "someone";
  const keyEvents = toLedgerRows(ledger, Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]))).filter(
    (row) => KEY_EVENTS.has(row.event),
  );

  // Per person: reviewed impact, and how much of it was AI-assisted (weighted by impact).
  const people = [...new Set(contributions.map((c) => c.author_id))]
    .map((author) => {
      const mine = contributions.filter((c) => c.author_id === author);
      const approved = mine.flatMap((c) => {
        const review = c.reviews.find((r) => r.verdict === "approved");
        return review ? [{ impact: review.impact, ai: Number(c.ai_share) }] : [];
      });
      const impact = approved.reduce((sum, a) => sum + a.impact, 0);
      const aiImpact = approved.reduce((sum, a) => sum + a.impact * a.ai, 0);
      return {
        author,
        files: mine.length,
        flagged: mine.filter((c) => c.flagged).length,
        impact,
        aiShare: impact > 0 ? aiImpact / impact : 0,
      };
    })
    .sort((a, b) => b.impact - a.impact);
  const totalImpact = people.reduce((sum, p) => sum + p.impact, 0);

  // What the sponsor receives: approved work, latest version only (earlier versions stay in the workspace).
  const superseded = new Set(contributions.map((c) => c.builds_on).filter(Boolean));
  const deliverables = contributions.filter(
    (c) => !superseded.has(c.id) && c.reviews.some((r) => r.verdict === "approved"),
  );

  const paid = charter ? isPaidModel(charter.model) : false;
  const accepted = milestones.filter((m) => m.status === "accepted");
  const complete = milestones.length > 0 && accepted.length === milestones.length;
  const paidTotal = payouts.reduce((sum, e) => sum + Number(e.payload.amount ?? 0), 0);
  const agentActions = ledger.filter((e) => e.event === "AGENT_ACTION").length;
  const card = "rounded-lg border border-border bg-card p-5";

  return (
    <>
      {heading}

      <JudgeNote>
        Nothing on this page is typed in by anyone. It is assembled from the ledger and the reviewed work: the same
        entries the Verify button checks. That is the answer to &quot;who did what, and why were they paid or credited
        what they were&quot;.
      </JudgeNote>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Outcome</h2>
            <Pill tone={complete ? "verified" : "pending"}>
              {complete ? "Complete" : `${accepted.length} of ${milestones.length} milestones accepted`}
            </Pill>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {project.title} · {charter ? `${MODEL_LABELS[charter.model]} · Charter v${charter.version}` : "no charter"}{" "}
            · {formatDate(project.start_date)} to {formatDate(project.end_date)}
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {m.position}. {m.title}
                </span>
                <Pill tone={statusTone[m.status]} className="capitalize">
                  {m.status}
                </Pill>
                {m.amount > 0 && <span className="text-xs text-muted-foreground">{formatRupees(m.amount)}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold">Payment status</h2>
          {paid || payouts.length > 0 || escrows.length > 0 ? (
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid to people</dt>
                <dd className="font-semibold text-verified">{formatRupees(paidTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Payouts issued</dt>
                <dd>{payouts.length}</dd>
              </div>
              {escrows.map((e) => (
                <div key={e.reference} className="flex justify-between">
                  <dt className="font-mono text-xs text-muted-foreground">{e.reference}</dt>
                  <dd className="capitalize">
                    {formatRupees(Number(e.amount))} · {e.status}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No money on this project. Credit is recorded and credentials are issued instead.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {!paid && payouts.length > 0 && "The charter has since gone unpaid; what was already paid stays paid. "}
            All payments are simulated.{" "}
            <Link href={`/projects/${id}/payouts`} className="text-accent underline-offset-4 hover:underline">
              See each receipt
            </Link>
          </p>
        </section>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Deliverables</h2>
          <Pill>Team only: sponsor and active members</Pill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The approved work, latest version of each piece. Every download is re-checked against the fingerprint the
          ledger recorded when it was uploaded.
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
          {deliverables.map((c) => {
            const milestone = milestones.find((m) => m.id === c.milestone_id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                <span className="font-medium">{c.title}</span>
                <span className="font-mono text-xs text-muted-foreground" title={c.artefact_hash}>
                  {c.artefact_name} · v{c.version} · sha256 {c.artefact_hash.slice(0, 8)}…
                </span>
                <span className="text-xs text-muted-foreground">
                  {nameOf(c.author_id)} · Milestone {milestone?.position}
                </span>
                {stored.has(c.artefact_hash) ? (
                  <a
                    href={`/api/contributions/${c.id}/file`}
                    className="text-xs font-medium text-accent underline-offset-4 hover:underline"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">(record only, no file stored)</span>
                )}
              </li>
            );
          })}
          {deliverables.length === 0 && <li className="text-muted-foreground">No approved work yet.</li>}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">Contribution breakdown</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Share of reviewed impact per person, split into human work and AI-assisted work. Credit for AI-assisted work
          stays with the human who owned and approved it.
        </p>
        <ul className="mt-4 flex flex-col gap-4 text-sm">
          {people.map((p) => {
            const share = totalImpact > 0 ? p.impact / totalImpact : 0;
            return (
              <li key={p.author}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{nameOf(p.author)}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.files} file{p.files === 1 ? "" : "s"}
                    {p.flagged > 0 && `, ${p.flagged} flagged`} · impact {p.impact} · {Math.round(share * 100)}% of
                    reviewed work · {Math.round(p.aiShare * 100)}% AI-assisted
                  </span>
                </div>
                <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div className="bg-verified" style={{ width: `${share * (1 - p.aiShare) * 100}%` }} />
                  <div className="bg-ai" style={{ width: `${share * p.aiShare * 100}%` }} />
                </div>
              </li>
            );
          })}
          {people.length === 0 && <li className="text-muted-foreground">No contributions yet.</li>}
        </ul>
        <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-verified" aria-hidden /> Human work
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ai" aria-hidden /> AI-assisted
          </span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-sm font-semibold">Credentials</h2>
          {credentials.length ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {credentials.map((e) => (
                <li key={e.seq} className="flex flex-wrap items-center gap-2">
                  <Pill tone="verified">{String(e.payload.title)}</Pill>
                  <span>{nameOf(e.payload.user_id)}</span>
                  <span className="font-mono text-xs text-muted-foreground">ledger #{e.seq}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              None issued yet. Credentials are issued when the sponsor accepts a milestone.
            </p>
          )}
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Audit trail</h2>
            <Pill tone={chain.ok ? "verified" : "alert"}>
              {chain.ok ? "Chain intact" : `Chain broken at #${chain.brokenAt}`}
            </Pill>
          </div>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ledger entries for this project</dt>
              <dd>{ledger.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Actions by AI agents (all owned by a human)</dt>
              <dd>{agentActions}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Similarity flags</dt>
              <dd>{ledger.filter((e) => e.event === "SIMILARITY_FLAGGED").length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Latest hash on the platform chain</dt>
              <dd className="font-mono text-xs" title={chain.lastHash}>
                {chain.lastHash.slice(0, 12)}…
              </dd>
            </div>
          </dl>
          <ol className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
            {keyEvents.map((row) => (
              <li key={row.seq} className="grid grid-cols-[5.5rem_1fr] gap-2">
                <span className="text-xs text-muted-foreground">{row.time.split(",")[0]}</span>
                <span className={row.verification.tone === "alert" ? "text-alert" : row.category === "money" ? "text-verified" : ""}>
                  {row.action}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Checked just now across all {chain.checked} entries.{" "}
            <Link href={`/projects/${id}/ledger`} className="text-accent underline-offset-4 hover:underline">
              Open the ledger
            </Link>
          </p>
        </section>
      </div>
      <section className="rounded-lg bg-primary px-5 py-4 text-center text-primary-foreground">
        <p className="text-base font-semibold">Contribution → Verification → Attribution → Credit / Payment</p>
        <p className="mt-1 text-sm opacity-80">Terms that run as code. Every rupee has a receipt.</p>
      </section>
    </>
  );
}

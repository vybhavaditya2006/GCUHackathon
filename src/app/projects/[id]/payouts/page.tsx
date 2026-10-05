import { notFound } from "next/navigation";
import { AcceptMilestoneButton } from "@/components/AcceptMilestoneButton";
import { JudgeNote } from "@/components/JudgeNote";
import { Pill } from "@/components/Pill";
import { ReceiptCard } from "@/components/ReceiptCard";
import { isPaidModel } from "@/lib/access";
import { userDb } from "@/lib/db";
import { formatRupees, type Payout } from "@/lib/engine/computeSplit";
import { getProjectView } from "@/lib/projects";
import { loadSplit, type SplitSummary } from "@/lib/split";

interface Shown {
  summary: SplitSummary | null;
  payouts: { payout: Payout; paymentRef?: string }[];
  credentials: { name: string; title: string }[];
}

export default async function PayoutsPage({ params }: PageProps<"/projects/[id]/payouts">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();
  const { user, charter, membership, isSponsor } = view;

  const milestone = view.milestones.find((m) => m.status !== "draft") ?? view.milestones[0];
  const seesAll = isSponsor || user.role === "admin";
  const onTeam = seesAll || (membership !== null && membership.status !== "invited");
  const monetary = charter ? isPaidModel(charter.model) : false;
  const accepted = milestone?.status === "accepted";

  const heading = (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">5 · Credit &amp; Payment</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        {monetary ? "Every rupee has a receipt" : "Credit without money"}
      </h1>
    </div>
  );

  if (!milestone || !charter || !onTeam) {
    return (
      <>
        {heading}
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          {!onTeam
            ? "Payouts and receipts are visible to the sponsor and to each team member for their own share. You are not on this project's team."
            : "This project has no milestone or charter to pay against yet."}
        </p>
      </>
    );
  }

  const shown: Shown = { summary: null, payouts: [], credentials: [] };

  if (accepted) {
    // Issued: read what was stored, with the user's own session, so RLS decides which rows come back.
    const db = await userDb();
    const [payoutsRes, ledgerRes] = await Promise.all([
      db.from("payouts").select("user_id, receipt, payment_ref").eq("milestone_id", milestone.id).order("payment_ref"),
      db
        .from("ledger")
        .select("event, payload")
        .eq("project_id", id)
        .in("event", ["MILESTONE_ACCEPTED", "CREDENTIAL_ISSUED"])
        .eq("payload->>milestone_id", milestone.id)
        .order("seq"),
    ]);
    shown.payouts = (payoutsRes.data ?? []).map((p) => ({ payout: p.receipt as Payout, paymentRef: p.payment_ref }));

    const entries = (ledgerRes.data ?? []) as { event: string; payload: Record<string, unknown> }[];
    const acceptedEntry = entries.find((e) => e.event === "MILESTONE_ACCEPTED");
    shown.summary = (acceptedEntry?.payload.summary as SplitSummary | undefined) ?? null;

    const issued = entries.filter((e) => e.event === "CREDENTIAL_ISSUED");
    const ids = [...new Set(issued.map((e) => String(e.payload.user_id)))];
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    shown.credentials = issued
      .filter((e) => seesAll || e.payload.user_id === user.id)
      .map((e) => ({ name: names.get(String(e.payload.user_id)) ?? "someone", title: String(e.payload.title) }));
  } else {
    // Not issued yet: run the engine now and show what the charter WOULD pay.
    const loaded = await loadSplit(milestone.id);
    if (loaded) {
      const { payouts, ...summary } = loaded.split;
      shown.summary = summary;
      shown.payouts = payouts.filter((p) => seesAll || p.userId === user.id).map((payout) => ({ payout }));
      shown.credentials = loaded.credentials.filter((c) => seesAll || c.userId === user.id);
    }
  }

  const s = shown.summary;
  const waterfall: { label: string; amount: number; tone: "money" | "taken" | "pool"; indent?: boolean }[] = s
    ? [
        { label: "Milestone budget in escrow", amount: s.budget, tone: "pool" },
        { label: "Platform fee", amount: -s.fee, tone: "taken" },
        { label: "AI compute reserve", amount: -s.aiReserve, tone: "taken" },
        { label: "Distributable", amount: s.distributable, tone: "pool" },
        { label: "Expert share", amount: s.expertTotal, tone: "money", indent: true },
        { label: "Student pool", amount: s.studentPool, tone: "money", indent: true },
        { label: "Shared equally", amount: s.equalPool, tone: "money", indent: true },
        { label: "By reviewed weight", amount: s.weightedPool, tone: "money", indent: true },
        ...(s.unallocated > 0
          ? [{ label: "Unallocated (pro-rata leftovers)", amount: s.unallocated, tone: "taken" as const, indent: true }]
          : []),
      ]
    : [];
  const barColour = { money: "bg-verified", taken: "bg-pending", pool: "bg-accent" };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {heading}
        {milestone.status === "submitted" && seesAll && (
          <AcceptMilestoneButton
            milestoneId={milestone.id}
            label={monetary ? "Accept milestone and release escrow" : "Accept milestone and issue credentials"}
          />
        )}
      </div>

      <JudgeNote>
        Nobody types these amounts. Accepting the milestone runs the charter engine, a pure function, on the reviewed
        work in the ledger, and stores each payout with the receipt that explains it. Until then this page shows a
        live preview from the same function.
      </JudgeNote>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium">
          Milestone {milestone.position}: {milestone.title}
        </span>
        <Pill tone={accepted ? "verified" : "pending"} className="capitalize">
          {milestone.status}
        </Pill>
        <span className="text-muted-foreground">Charter v{charter.version}</span>
        <span className="text-muted-foreground">Accepted when: {milestone.acceptance_criteria}</span>
      </section>

      {monetary && s && s.budget > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">
            Waterfall from {formatRupees(s.budget)} {accepted ? "" : "(preview)"}
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {waterfall.map((row) => (
              <li key={row.label} className="grid grid-cols-[13rem_1fr_6rem] items-center gap-3">
                <span className={row.indent ? "pl-4 text-muted-foreground" : "font-medium"}>{row.label}</span>
                <span className="h-2.5 rounded-full bg-secondary">
                  <span
                    className={`block h-full rounded-full ${barColour[row.tone]}`}
                    style={{ width: `${(Math.abs(row.amount) / s.budget) * 100}%` }}
                  />
                </span>
                <span className="text-right font-medium tabular-nums">
                  {row.amount < 0 ? `− ${formatRupees(-row.amount)}` : formatRupees(row.amount)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Fee + AI reserve + paid out{s.unallocated > 0 ? " + unallocated" : ""} = {formatRupees(s.budget)} exactly.
            Total paid to people: {formatRupees(s.totalPaid)}.
          </p>
        </section>
      )}

      {!monetary && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          This is a knowledge-sharing project: no escrow, no payouts. The same engine still records each
          person&apos;s reviewed weight, and acceptance issues credentials instead of money.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{monetary ? "Payouts and receipts" : "Reviewed credit"}</h2>
        {shown.payouts.map(({ payout, paymentRef }) => (
          <ReceiptCard
            key={payout.userId}
            payout={payout}
            paymentRef={paymentRef}
            monetary={monetary}
            isYou={payout.userId === user.id}
          />
        ))}
        {shown.payouts.length === 0 && (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {accepted && !monetary ? "No money moved on this project." : "There is no share for you on this milestone."}
          </p>
        )}
        {!seesAll && (
          <p className="text-xs text-muted-foreground">
            You see your own share. Other members&apos; payouts are visible only to them and the sponsor.
          </p>
        )}
      </section>

      {shown.credentials.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Credentials {accepted ? "issued" : "on acceptance"}</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {shown.credentials.map((c) => (
              <li key={`${c.name}:${c.title}`} className="flex flex-wrap items-center gap-2">
                <Pill tone={accepted ? "verified" : "pending"}>{c.title}</Pill>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

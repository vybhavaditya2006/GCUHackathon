import { isPaidModel, MODEL_LABELS, type CharterModel } from "@/lib/access";
import { Pill } from "@/components/Pill";

interface CharterCardProps {
  version: number;
  model: CharterModel;
  terms: Record<string, unknown>;
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const pct = (v: unknown): number => (typeof v === "number" ? v : 0);

/** Charter-at-a-glance: the terms the engine will run, in plain English. */
export function CharterCard({ version, model, terms }: CharterCardProps) {
  const paid = isPaidModel(model);
  const credentials = Array.isArray(terms.credentials) ? (terms.credentials as string[]) : [];
  const silentDays = typeof terms.sponsorSilentDays === "number" ? terms.sponsorSilentDays : null;

  const rows: [string, string | null][] = [
    ...(paid
      ? ([
          ["Platform fee", `${pct(terms.feePct)}% of the milestone budget`],
          ["AI reserve", `${pct(terms.aiReservePct)}% pays for agent compute`],
          ["Expert", `${pct(terms.expertPct)}% of what remains`],
          [
            "Students",
            `${pct(terms.equalPct)}% split equally + ${pct(terms.weightedPct)}% by reviewed impact`,
          ],
        ] as [string, string][])
      : ([
          ["Payment", "None. This project issues credit and credentials only."],
          [
            "Credit",
            `${pct(terms.equalPct)}% shared equally + ${pct(terms.weightedPct)}% by reviewed impact`,
          ],
        ] as [string, string][])),
    ["IP", text(terms.ip)],
    ["Confidentiality", text(terms.confidentiality)],
    ["If someone leaves", text(terms.onExit)],
    ["Sponsor silent", silentDays === null ? null : `Auto-accept after ${silentDays} days`],
    ["Credentials", credentials.length ? credentials.join(" · ") : null],
  ];

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Charter at a glance</h2>
        <div className="flex items-center gap-2">
          <Pill tone={paid ? "verified" : "ai"}>{MODEL_LABELS[model]}</Pill>
          <Pill>v{version}</Pill>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-border text-sm">
        {rows.map(
          ([label, value]) =>
            value && (
              <div key={label} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
        )}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        These terms are stored as data. The charter engine runs them to produce every payout and its receipt.
      </p>
    </section>
  );
}

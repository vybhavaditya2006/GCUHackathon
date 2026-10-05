import { Pill } from "@/components/Pill";
import { formatRupees, type Payout } from "@/lib/engine/computeSplit";

/** One person's payout with the expandable plain-English receipt the engine wrote for it. */
export function ReceiptCard({
  payout,
  paymentRef,
  monetary,
  isYou,
}: {
  payout: Payout;
  /** Set once the payout has been issued; absent while it is still a preview. */
  paymentRef?: string;
  monetary: boolean;
  isYou: boolean;
}) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="min-w-40 flex-1 font-medium">
          {payout.name}
          {isYou && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
        </span>
        <Pill className="capitalize">{payout.role}</Pill>
        {payout.role === "student" && (
          <span className="text-xs text-muted-foreground">
            impact {payout.impact} · weight {Math.round(payout.weight * 100)}%
          </span>
        )}
        {payout.aiShare > 0 && <Pill tone="ai">{Math.round(payout.aiShare * 100)}% AI-assisted</Pill>}
        {payout.activeFraction < 1 && (
          <Pill tone="pending">active {Math.round(payout.activeFraction * 100)}%</Pill>
        )}
        {monetary && <span className="w-24 text-right text-base font-semibold text-verified">{formatRupees(payout.amount)}</span>}
        <Pill tone={paymentRef ? "verified" : "pending"}>{paymentRef ? "Paid (simulated)" : "Preview"}</Pill>
        <span className="text-xs text-accent group-open:hidden">Show receipt</span>
        <span className="hidden text-xs text-accent group-open:inline">Hide receipt</span>
      </summary>
      <div className="border-t border-border px-4 py-3 text-sm">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          {payout.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          {payout.ledgerRefs.length > 0 && <>Based on ledger entries {payout.ledgerRefs.map((s) => `#${s}`).join(", ")}. </>}
          {paymentRef && <>Payment reference {paymentRef} (simulated; no real money moved).</>}
        </p>
      </div>
    </details>
  );
}

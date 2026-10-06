"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Pill } from "@/components/Pill";
import type { LedgerViewRow } from "@/lib/ledgerView";
import { cn } from "@/lib/utils";

interface VerifyResult {
  ok: boolean;
  brokenAt: number | null;
  checked: number;
  lastHash: string;
}

const filters = [
  { id: "all", label: "All", test: () => true },
  { id: "people", label: "People", test: (r: LedgerViewRow) => !r.isAgent },
  { id: "agents", label: "AI agents", test: (r: LedgerViewRow) => r.isAgent },
  { id: "review", label: "Reviews and flags", test: (r: LedgerViewRow) => r.category === "review" },
  { id: "money", label: "Money", test: (r: LedgerViewRow) => r.category === "money" },
] as const;

const short = (hash: string) => `${hash.slice(0, 8)}…`;

/** The ledger timeline with filters and the Verify button. */
export function LedgerTable({ rows }: { rows: LedgerViewRow[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ledger/verify", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Verification could not run.");
        return;
      }
      setResult(body);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const test = filters.find((f) => f.id === filter)!.test;
  const visible = rows.filter(test);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter entries">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f.id
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <ShieldCheck className="size-4" aria-hidden />
          {busy ? "Verifying..." : "Verify the chain"}
        </button>
      </div>

      {result && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
            result.ok ? "border-verified bg-verified-soft text-verified" : "border-alert bg-alert-soft text-alert",
          )}
        >
          {result.ok ? (
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          ) : (
            <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          )}
          <div>
            <p className="font-semibold">
              {result.ok
                ? `Chain intact: all ${result.checked} entries re-hashed and matched.`
                : `Chain broken at #${result.brokenAt}: that entry no longer matches its hash.`}
            </p>
            <p className="mt-0.5 text-foreground/80">
              {result.ok ? (
                <>
                  Latest hash <span className="font-mono">{short(result.lastHash)}</span>. Every hash covers the entry
                  before it, so changing any old entry would break all the ones after it.
                </>
              ) : (
                <>
                  {result.checked} entries before it are still intact. Someone changed #{result.brokenAt} (or an
                  entry around it) after it was written.
                </>
              )}
            </p>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {["#", "Time (IST)", "Actor", "Action", "Evidence", "AI share", "Verification", "Hash"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((row) => {
              const broken = result && !result.ok && result.brokenAt !== null && row.seq >= result.brokenAt;
              return (
                <tr key={row.seq} className={cn("align-top", broken && "bg-alert-soft")}>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.seq}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{row.time}</td>
                  <td className="px-3 py-2">
                    {row.isAgent ? (
                      <>
                        <Pill tone="ai">{row.actorName} agent</Pill>
                        <span className="mt-0.5 block text-xs text-muted-foreground">owned by {row.ownerName}</span>
                      </>
                    ) : (
                      <span className="whitespace-nowrap">{row.actorName}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.action}
                    <span className="block font-mono text-[11px] text-muted-foreground">{row.event}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.evidence ? (
                      <>
                        {row.evidence.label}
                        {row.evidence.hash && (
                          <span className="block font-mono text-muted-foreground" title={row.evidence.hash}>
                            sha256 {short(row.evidence.hash)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {row.aiShare === null ? (
                      <span className="text-muted-foreground">-</span>
                    ) : row.aiShare > 0 ? (
                      <span className="font-medium text-ai">{Math.round(row.aiShare * 100)}% AI</span>
                    ) : (
                      "Human only"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={broken ? "alert" : row.verification.tone}>
                      {broken ? "Hash mismatch" : row.verification.label}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground" title={row.hash}>
                    {short(row.hash)}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No entries match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

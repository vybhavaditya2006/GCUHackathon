"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Pill } from "@/components/Pill";

interface OpenedBrief {
  content: string;
  viewedBy: string;
  hash: string;
}

/**
 * The confidential brief. When locked, the server never sends the content: the
 * blurred lines are placeholders. When unlocked, the content is fetched on
 * demand so each view is recorded in the ledger.
 */
export function BriefPanel({
  projectId,
  unlocked,
  reason,
  children,
}: {
  projectId: string;
  unlocked: boolean;
  reason: string;
  /** Shown under the lock, e.g. the accept-charter form. */
  children?: React.ReactNode;
}) {
  const [brief, setBrief] = useState<OpenedBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/brief`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(`${res.status}: ${body?.error ?? "The brief could not be opened."}`);
        return;
      }
      setBrief(body);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Confidential brief</h2>
        {unlocked ? (
          <Pill tone="verified">
            <LockOpen className="size-3" aria-hidden /> Unlocked
          </Pill>
        ) : (
          <Pill tone="alert">
            <Lock className="size-3" aria-hidden /> Locked
          </Pill>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{reason}</p>

      {!unlocked && (
        <>
          <div className="relative mt-4 overflow-hidden rounded-md border border-border bg-background p-4">
            <div className="flex flex-col gap-2.5 blur-[5px] select-none" aria-hidden>
              {[92, 78, 85, 64, 71].map((width) => (
                <span key={width} className="h-3 rounded bg-muted-foreground/40" style={{ width: `${width}%` }} />
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-alert">
                <Lock className="size-4" aria-hidden /> Locked by row-level security
              </span>
            </div>
          </div>
          {children && <div className="mt-4">{children}</div>}
        </>
      )}

      {unlocked && !brief && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Opening..." : "Open the brief"}
          </button>
          <span className="text-xs text-muted-foreground">Each view is recorded in the ledger as BRIEF_VIEWED.</span>
        </div>
      )}

      {brief && (
        <div className="mt-4 rounded-md border border-border bg-background p-4">
          <ul className="flex flex-col gap-1.5 text-sm">
            {brief.content.split("\n").map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
            Viewed by {brief.viewedBy} · ledger entry{" "}
            <span className="font-mono">{brief.hash.slice(0, 12)}</span>
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptCharterForm({
  projectId,
  version,
  acknowledgement,
}: {
  projectId: string;
  version: number;
  /** The sentence the member must tick, naming the engagement model. */
  acknowledgement: string;
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/charter/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelAcknowledged: acknowledged }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not accept the charter.");
        return;
      }
      // Re-read the page on the server: RLS now lets the brief through.
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--accent)]"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>{acknowledgement}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!acknowledged || busy}
          className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? "Recording..." : `Accept Charter v${version}`}
        </button>
        <span className="text-xs text-muted-foreground">
          Writes CHARTER_ACCEPTED to the ledger and unlocks the brief.
        </span>
      </div>
      {error && (
        <p role="alert" className="text-alert">
          {error}
        </p>
      )}
    </form>
  );
}

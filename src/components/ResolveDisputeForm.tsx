"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [resolution, setResolution] = useState("The ledger shows the cited criterion was met and reviewed.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(inFavourOf: "team" | "sponsor") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inFavourOf, resolution }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "The decision was not saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const button = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";

  return (
    <div className="mt-2 flex flex-col gap-2">
      <input
        aria-label="Reason for the decision"
        className="rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-accent"
        value={resolution}
        maxLength={500}
        onChange={(e) => setResolution(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => decide("team")} className={`${button} bg-verified text-white`}>
          Decide for the team (back to submitted)
        </button>
        <button type="button" disabled={busy} onClick={() => decide("sponsor")} className={`${button} border border-border bg-card`}>
          Decide for the sponsor (stays rejected)
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

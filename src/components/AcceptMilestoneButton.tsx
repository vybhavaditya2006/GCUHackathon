"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptMilestoneButton({
  milestoneId,
  label,
  stayOn,
}: {
  milestoneId: string;
  label: string;
  /** Where to land afterwards, so the page keeps showing the milestone that was just accepted. */
  stayOn: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/accept`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not accept the milestone.");
        return;
      }
      router.replace(stayOn);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="rounded-md bg-verified px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Running the charter..." : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

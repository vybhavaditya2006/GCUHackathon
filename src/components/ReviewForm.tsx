"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const verdicts = [
  { value: "approved", label: "Approve" },
  { value: "changes_requested", label: "Request changes" },
  { value: "rejected", label: "Reject" },
] as const;

/** The expert's review of one contribution. The impact score is what the charter weights by. */
export function ReviewForm({ contributionId }: { contributionId: string }) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<(typeof verdicts)[number]["value"]>("approved");
  const [impact, setImpact] = useState(3);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contributions/${contributionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, impact: verdict === "approved" ? impact : 0, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "The review was not saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-input bg-card px-2 py-1 text-xs outline-none focus:border-accent";

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label="Verdict"
        className={input}
        value={verdict}
        onChange={(e) => setVerdict(e.target.value as typeof verdict)}
      >
        {verdicts.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
      {verdict === "approved" && (
        <label className="flex items-center gap-1">
          Impact
          <input
            type="number"
            min={0}
            max={10}
            className={`${input} w-14`}
            value={impact}
            onChange={(e) => setImpact(Number(e.target.value))}
          />
        </label>
      )}
      <input
        aria-label="Review notes"
        className={`${input} min-w-40 flex-1`}
        placeholder="Notes for the author"
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Saving..." : "Record review"}
      </button>
      {error && (
        <p role="alert" className="basis-full text-alert">
          {error}
        </p>
      )}
    </form>
  );
}

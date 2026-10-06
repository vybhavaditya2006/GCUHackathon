"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadResult {
  artefactHash: string;
  similarity: number;
  matched: string | null;
  flagged: boolean;
  version: number;
  seq: number;
}

export function UploadContributionForm({
  milestones,
  earlier,
}: {
  milestones: { id: string; label: string }[];
  /** Contributions already on the project that a new one can build on or replace. */
  earlier: { id: string; label: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [milestoneId, setMilestoneId] = useState(milestones[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/contributions`, {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "The upload failed.");
        return;
      }
      setResult(body);
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-medium">
          Milestone
          <select className={input} value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          File (up to 1 MB)
          <input type="file" name="file" required className={input} />
        </label>
      </div>
      <label className="flex flex-col gap-1 font-medium">
        What is it?
        <input name="title" required minLength={3} maxLength={120} className={input} placeholder="e.g. Quantisation notes" />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        AI-use declaration (required)
        <input
          name="aiDeclaration"
          required
          minLength={3}
          maxLength={500}
          className={input}
          placeholder="e.g. No AI used. / Outline drafted with an AI tool, text is mine."
        />
      </label>
      <label className="flex flex-col gap-1 font-medium">
        Builds on / replaces (optional)
        <select name="buildsOn" defaultValue="" className={input}>
          <option value="">Nothing: this is new work (version 1)</option>
          {earlier.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-muted-foreground">
          The earlier version stays on record; this one becomes the next version and the ledger links the two.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !milestoneId}
          className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? "Fingerprinting..." : "Upload contribution"}
        </button>
        <span className="text-xs text-muted-foreground">
          The file is fingerprinted (SHA-256), checked for similarity and recorded in the ledger.
        </span>
      </div>
      {result && (
        <p role="status" className={result.flagged ? "text-alert" : "text-verified"}>
          {result.flagged
            ? `Recorded as ledger entry #${result.seq}, and flagged: ${Math.round(result.similarity * 100)}% similar to ${result.matched}. An expert will look at it.`
            : `Recorded as ledger entry #${result.seq}${result.version > 1 ? ` (version ${result.version})` : ""}. Similarity ${Math.round(result.similarity * 100)}%, fingerprint ${result.artefactHash.slice(0, 12)}.`}
        </p>
      )}
      {error && (
        <p role="alert" className="text-alert">
          {error}
        </p>
      )}
    </form>
  );
}

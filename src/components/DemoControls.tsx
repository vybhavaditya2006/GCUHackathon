"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Student {
  id: string;
  name: string;
}

const button =
  "rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-50";

/** Admin demo controls for one project: each button triggers one corner case through the normal write path. */
export function DemoControls({ projectId, students }: { projectId: string; students: Student[] }) {
  const router = useRouter();
  const [student, setStudent] = useState(students[0]?.id ?? "");
  const [percent, setPercent] = useState(60);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(control: Record<string, unknown>) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...control }),
      });
      const body = await res.json().catch(() => null);
      setResult(res.ok ? { ok: true, text: body.message } : { ok: false, text: `Refused: ${body?.error ?? "that did not work."}` });
      if (res.ok) router.refresh();
    } catch {
      setResult({ ok: false, text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const row = "flex flex-wrap items-center gap-2 py-3";
  const what = "min-w-52 flex-1 text-sm";

  return (
    <div className="flex flex-col divide-y divide-border">
      <div className={row}>
        <p className={what}>
          <span className="font-medium">Student quits midway.</span>{" "}
          <span className="text-muted-foreground">Pro-rata equal share, reviewed credit kept, access revoked.</span>
        </p>
        <select
          aria-label="Student"
          className={button}
          value={student}
          onChange={(e) => setStudent(e.target.value)}
          disabled={students.length === 0}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          after
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            className={`${button} w-16`}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
          %
        </label>
        <button
          type="button"
          className={button}
          disabled={busy || !student}
          onClick={() => run({ action: "quit", userId: student, percent })}
        >
          Trigger
        </button>
      </div>

      <div className={row}>
        <p className={what}>
          <span className="font-medium">Sponsor silent.</span>{" "}
          <span className="text-muted-foreground">Auto-accept after the charter&apos;s review window; the engine pays out.</span>
        </p>
        <button type="button" className={button} disabled={busy} onClick={() => run({ action: "silent" })}>
          Trigger
        </button>
      </div>

      <div className={row}>
        <p className={what}>
          <span className="font-medium">Paid to unpaid.</span>{" "}
          <span className="text-muted-foreground">
            New charter version: briefs re-lock, unreleased escrow is refunded, members re-accept or leave with credit.
          </span>
        </p>
        <button type="button" className={button} disabled={busy} onClick={() => run({ action: "unpaid" })}>
          Trigger
        </button>
      </div>

      <div className={row}>
        <p className={what}>
          <span className="font-medium">Unfair rejection.</span>{" "}
          <span className="text-muted-foreground">
            A rejection must cite a criterion. The team can dispute it, which freezes the escrow until an admin decides.
          </span>
        </p>
        <button type="button" className={button} disabled={busy} onClick={() => run({ action: "reject", citeCriterion: false })}>
          1. Reject with no criterion
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => run({ action: "reject", citeCriterion: true })}>
          2. Reject citing one
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => run({ action: "dispute" })}>
          3. Team disputes
        </button>
      </div>

      <div className={row}>
        <p className={what}>
          <span className="font-medium">AI wrote most of it.</span>{" "}
          <span className="text-muted-foreground">
            Nothing to trigger: the credit goes to the human owner and the AI share is printed on the receipt.
          </span>
        </p>
        <Link href={`/projects/${projectId}/payouts`} className={button}>
          Open the receipts
        </Link>
      </div>

      {result && (
        <p role="status" className={`pt-3 text-sm ${result.ok ? "text-verified" : "text-alert"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}

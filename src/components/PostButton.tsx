"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** A button that POSTs to one of our API routes, then re-renders the page from the server. */
export function PostButton({
  url,
  label,
  busyLabel,
  tone = "primary",
  body,
}: {
  url: string;
  label: string;
  busyLabel: string;
  tone?: "primary" | "money";
  /** Optional JSON body. */
  body?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={post}
        disabled={busy}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50",
          tone === "money" ? "bg-verified text-white" : "bg-primary text-primary-foreground",
        )}
      >
        {busy ? busyLabel : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

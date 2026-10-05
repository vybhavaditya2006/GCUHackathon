"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The six sheets of the PoC. Flip `ready` to true when a page is built.
const steps = [
  { label: "Discovery", segment: "", ready: true },
  { label: "Scoping & Matching", segment: "scope", ready: false },
  { label: "Workspace", segment: "workspace", ready: false },
  { label: "Ledger", segment: "ledger", ready: false },
  { label: "Credit & Payment", segment: "payouts", ready: false },
  { label: "Final record", segment: "record", ready: false },
];

export function JourneyStepper({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const current = steps.findIndex((s) => pathname === (s.segment ? `${base}/${s.segment}` : base));

  return (
    <nav aria-label="Project journey" className="border-b border-border bg-card">
      <ol className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-6 py-2 text-sm">
        {steps.map((step, i) => {
          const active = i === current;
          const content = (
            <>
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  active ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              {step.label}
            </>
          );
          const className = cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 whitespace-nowrap",
            active ? "font-semibold text-foreground" : "text-muted-foreground",
            step.ready && !active && "hover:bg-secondary",
          );
          return (
            <li key={step.label} className="flex items-center gap-1">
              {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
              {step.ready ? (
                <Link
                  href={step.segment ? `${base}/${step.segment}` : base}
                  className={className}
                  aria-current={active ? "step" : undefined}
                >
                  {content}
                </Link>
              ) : (
                <span className={cn(className, "opacity-60")} aria-disabled>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

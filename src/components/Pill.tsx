import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "ai" | "verified" | "alert" | "pending";

const tones: Record<PillTone, string> = {
  neutral: "bg-secondary text-foreground",
  ai: "bg-ai-soft text-ai",
  verified: "bg-verified-soft text-verified",
  alert: "bg-alert-soft text-alert",
  pending: "bg-pending-soft text-pending",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

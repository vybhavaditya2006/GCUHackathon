/** The strip on every sheet that tells a judge what this screen proves. */
export function JudgeNote({ children }: { children: React.ReactNode }) {
  return (
    <aside className="flex gap-3 rounded-lg border border-border border-l-4 border-l-accent bg-card px-4 py-3 text-sm">
      <span className="shrink-0 font-semibold text-accent">Judge note</span>
      <p className="text-muted-foreground">{children}</p>
    </aside>
  );
}

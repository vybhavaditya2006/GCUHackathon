import { Pill } from "@/components/Pill";

export interface TaskCard {
  id: string;
  title: string;
  status: "todo" | "in_review" | "done";
  ownerName: string;
  milestoneLabel: string;
  /** The contribution that closed the task, if there is one yet. */
  work: { artefact: string; version: number; agent: string | null; aiShare: number } | null;
}

const columns: { status: TaskCard["status"]; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
];

/** How the milestones were split: one card per task, with its human owner and any agent used. */
export function TaskBoard({ tasks }: { tasks: TaskCard[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {columns.map((col) => {
        const cards = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className="rounded-md border border-border bg-background p-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              {col.label} · {cards.length}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {cards.map((t) => (
                <li key={t.id} className="rounded-md border border-border bg-card p-3 text-sm">
                  <p className="font-medium">{t.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.ownerName} · {t.milestoneLabel}
                  </p>
                  {t.work && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.work.artefact} · v{t.work.version}
                      </span>
                      {t.work.agent && (
                        <Pill tone="ai">
                          {t.work.agent} agent · {Math.round(t.work.aiShare * 100)}% AI
                        </Pill>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {cards.length === 0 && <li className="text-xs text-muted-foreground">Nothing here.</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

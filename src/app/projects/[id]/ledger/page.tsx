import { notFound } from "next/navigation";
import { JudgeNote } from "@/components/JudgeNote";
import { LedgerTable } from "@/components/LedgerTable";
import { userDb } from "@/lib/db";
import { reviewedWeights, toLedgerRows, type LedgerEntry } from "@/lib/ledgerView";
import { getProjectView, isUuid } from "@/lib/projects";

export default async function LedgerPage({ params }: PageProps<"/projects/[id]/ledger">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();

  // Read with the user's own session: RLS returns rows only to members and admins.
  const db = await userDb();
  const { data } = await db
    .from("ledger")
    .select("seq, ts, actor, on_behalf_of, event, payload, hash")
    .eq("project_id", id)
    .order("seq");
  const entries = (data ?? []) as LedgerEntry[];

  const ids = new Set<string>();
  for (const e of entries) {
    for (const value of [e.actor, e.on_behalf_of, e.payload.user_id, e.payload.author_id]) {
      if (typeof value === "string" && isUuid(value)) ids.add(value);
    }
  }
  const { data: profiles } = ids.size
    ? await db.from("profiles").select("id, full_name").in("id", [...ids])
    : { data: [] };
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows = toLedgerRows(entries, names);
  const weights = reviewedWeights(entries, names);
  const agentRows = rows.filter((r) => r.isAgent).length;

  return (
    <>
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">4 · Ledger</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Who did what, and the proof</h1>
      </div>

      <JudgeNote>
        Every human and AI action is one append-only entry, and each entry&apos;s hash covers the one before it. Verify
        re-hashes the whole chain in the database. To see it fail, edit any old entry in the SQL editor and press
        Verify again: it names the first broken entry.
      </JudgeNote>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          The ledger is visible to project members and platform admins. You are not a member of this project, so the
          database returned no entries.
        </p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_17rem]">
          <LedgerTable rows={rows} />

          <aside className="flex flex-col gap-5">
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Reviewed weights</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                From approved expert reviews in this ledger. Commit counts are never used.
              </p>
              {weights.length ? (
                <ul className="mt-3 flex flex-col gap-3 text-sm">
                  {weights.map((w) => (
                    <li key={w.userId}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{w.name}</span>
                        <span className="text-xs text-muted-foreground">
                          impact {w.impact} · {Math.round(w.weight * 100)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-verified" style={{ width: `${w.weight * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No reviewed work yet.</p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-4 text-sm">
              <h2 className="font-semibold">At a glance</h2>
              <dl className="mt-2 flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Entries</dt>
                  <dd className="font-medium">{rows.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">By AI agents</dt>
                  <dd className="font-medium">{agentRows}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Flags raised</dt>
                  <dd className="font-medium">{rows.filter((r) => r.event === "SIMILARITY_FLAGGED").length}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Every agent entry names the human who owns it. An agent cannot write to the ledger without one.
              </p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

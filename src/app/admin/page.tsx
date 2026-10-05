import Link from "next/link";
import { DemoControls } from "@/components/DemoControls";
import { Pill, type PillTone } from "@/components/Pill";
import { ResolveDisputeForm } from "@/components/ResolveDisputeForm";
import { TopBar } from "@/components/TopBar";
import { MODEL_LABELS, type CharterModel } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { userDb } from "@/lib/db";
import { verify } from "@/lib/ledger";

export const metadata = { title: "Admin · Executable Charter" };

const statusTone: Record<string, PillTone> = {
  draft: "neutral",
  funded: "ai",
  submitted: "pending",
  accepted: "verified",
  rejected: "alert",
  disputed: "alert",
};

export default async function AdminPage() {
  const user = await requireUser();
  if (user.role !== "admin") {
    return (
      <>
        <TopBar user={user} />
        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
          <p className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            The admin console is for platform admins only.
          </p>
        </main>
      </>
    );
  }

  // Read with the admin's own session: RLS gives admins the ledger, memberships and disputes
  // of every project, but never a confidential brief.
  const db = await userDb();
  const [projectsRes, milestonesRes, chartersRes, membersRes, disputesRes, usersRes, ledgerRes, chain] =
    await Promise.all([
      db.from("projects").select("id, title, status").order("created_at"),
      db.from("milestones").select("id, project_id, position, title, status").order("position"),
      db.from("charters").select("project_id, version, model").order("version"),
      db.from("memberships").select("project_id, user_id, role, status, active_fraction"),
      db.from("disputes").select("id, project_id, milestone_id, raised_by, reason, criterion_cited, status, resolution").order("created_at", { ascending: false }),
      db.from("profiles").select("id, full_name, role, organisation, verified, completed_projects").order("role").order("full_name"),
      db.from("ledger").select("seq, event, project_id").order("seq", { ascending: false }).limit(8),
      verify(),
    ]);

  const projects = projectsRes.data ?? [];
  const milestones = milestonesRes.data ?? [];
  const members = membersRes.data ?? [];
  const disputes = disputesRes.data ?? [];
  const users = usersRes.data ?? [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.full_name ?? "someone";
  const latest = new Map<string, { version: number; model: CharterModel }>();
  for (const c of chartersRes.data ?? []) latest.set(c.project_id, { version: c.version, model: c.model });

  const card = "rounded-lg border border-border bg-card p-5";

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit the ledger, resolve disputes and trigger corner cases for the demo. Admins cannot read confidential
            briefs.
          </p>
        </div>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Ledger audit</h2>
            <Pill tone={chain.ok ? "verified" : "alert"}>
              {chain.ok ? `Chain intact: ${chain.checked} entries` : `Chain broken at #${chain.brokenAt}`}
            </Pill>
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {(ledgerRes.data ?? []).map((e) => (
              <li key={e.seq} className="flex flex-wrap gap-x-3">
                <span className="w-10 font-mono text-xs text-muted-foreground">#{e.seq}</span>
                <span className="font-mono text-xs">{e.event}</span>
                <span className="text-xs text-muted-foreground">{projects.find((p) => p.id === e.project_id)?.title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            The latest 8 entries across all projects. To put the demo back to its starting state, re-run
            supabase/seed.sql in the Supabase SQL editor.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold">Demo controls</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each control calls the same database function a real user&apos;s action would, recorded under the person
              who would really take it (the student, the sponsor, the team lead) and marked in the ledger as triggered
              from the demo controls. Then the charter engine re-runs.
            </p>
          </div>
          {projects.map((p) => {
            const charter = latest.get(p.id);
            const students = members
              .filter((m) => m.project_id === p.id && m.role === "student" && m.status === "active")
              .map((m) => ({ id: m.user_id, name: nameOf(m.user_id) }));
            return (
              <div key={p.id} className={card}>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/projects/${p.id}/payouts`} className="font-medium underline-offset-4 hover:underline">
                    {p.title}
                  </Link>
                  {charter && (
                    <Pill>
                      {MODEL_LABELS[charter.model]} · Charter v{charter.version}
                    </Pill>
                  )}
                  {milestones
                    .filter((m) => m.project_id === p.id)
                    .map((m) => (
                      <Pill key={m.id} tone={statusTone[m.status]} className="capitalize">
                        M{m.position}: {m.status}
                      </Pill>
                    ))}
                </div>
                <div className="mt-2">
                  <DemoControls projectId={p.id} students={students} />
                </div>
              </div>
            );
          })}
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold">Disputes</h2>
          {disputes.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
              {disputes.map((d) => {
                const m = milestones.find((x) => x.id === d.milestone_id);
                return (
                  <li key={d.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m ? `Milestone ${m.position}: ${m.title}` : "Milestone"}</span>
                      <Pill tone={d.status === "open" ? "alert" : "verified"} className="capitalize">
                        {d.status}
                      </Pill>
                      {d.status === "open" && <Pill tone="pending">Escrow frozen</Pill>}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {nameOf(d.raised_by)}: {d.reason} Sponsor cited: &quot;{d.criterion_cited}&quot;.
                    </p>
                    {d.status === "open" ? (
                      <ResolveDisputeForm disputeId={d.id} />
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Decision: {d.resolution}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No disputes. Raise one from the demo controls above.</p>
          )}
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold">Users (synthetic)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  {["Name", "Role", "Organisation", "Verified", "Completed projects", "Memberships"].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-2 py-2 font-medium">{u.full_name}</td>
                    <td className="px-2 py-2 capitalize">{u.role}</td>
                    <td className="px-2 py-2 text-muted-foreground">{u.organisation}</td>
                    <td className="px-2 py-2">
                      <Pill tone={u.verified ? "verified" : "pending"}>{u.verified ? "Verified" : "Not verified"}</Pill>
                    </td>
                    <td className="px-2 py-2">{u.completed_projects}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {members
                        .filter((m) => m.user_id === u.id)
                        .map((m) => `${m.role} (${m.status}${Number(m.active_fraction) < 1 ? `, ${Math.round(Number(m.active_fraction) * 100)}%` : ""})`)
                        .join(", ") || "none"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

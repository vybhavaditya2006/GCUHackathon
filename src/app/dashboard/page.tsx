import Link from "next/link";
import { Pill, type PillTone } from "@/components/Pill";
import { TopBar } from "@/components/TopBar";
import { isPaidModel, MODEL_LABELS, type CharterModel, type MembershipStatus } from "@/lib/access";
import { requireUser, type UserRole } from "@/lib/auth";
import { userDb } from "@/lib/db";

export const metadata = { title: "Dashboard · Executable Charter" };

interface ProjectRow {
  id: string;
  sponsor_id: string;
  title: string;
  status: string;
}

interface MembershipRow {
  project_id: string;
  role: string;
  status: MembershipStatus;
  is_lead: boolean;
  charter_version: number | null;
}

const intro: Record<UserRole, string> = {
  sponsor: "Projects you fund. Every acceptance releases escrow through the charter and leaves a receipt.",
  expert: "Projects you review. Your impact scores decide the weighted share, so every review is in the ledger.",
  student: "Your projects and invitations. Accept a charter to unlock its brief and start contributing.",
  admin: "Every project on the platform. Admins audit the ledger but cannot read confidential briefs.",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await userDb();

  const [projectsRes, chartersRes, membershipsRes] = await Promise.all([
    db.from("projects").select("id, sponsor_id, title, status").order("created_at"),
    db.from("charters").select("project_id, version, model").order("version"),
    db.from("memberships").select("project_id, role, status, is_lead, charter_version").eq("user_id", user.id),
  ]);

  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const memberships = new Map(((membershipsRes.data ?? []) as MembershipRow[]).map((m) => [m.project_id, m]));
  // Ordered by version, so the last one seen per project is the latest.
  const latest = new Map<string, { version: number; model: CharterModel }>();
  for (const c of chartersRes.data ?? []) latest.set(c.project_id, { version: c.version, model: c.model });

  const mine = projects.filter((p) => p.sponsor_id === user.id || memberships.has(p.id));
  const others = projects.filter((p) => !mine.includes(p));

  function state(p: ProjectRow): { label: string; tone: PillTone } {
    const m = memberships.get(p.id);
    const version = latest.get(p.id)?.version;
    if (p.sponsor_id === user.id) return { label: "Sponsor", tone: "ai" };
    if (!m) return { label: user.role === "admin" ? "Audit only" : "Not a member", tone: "neutral" };
    if (m.status === "invited") return { label: "Invitation: review the charter", tone: "pending" };
    if (m.status === "exited") return { label: "Exited", tone: "neutral" };
    if (m.status === "inactive") return { label: "Inactive", tone: "pending" };
    if (version !== undefined && m.charter_version !== version) {
      return { label: `Re-accept Charter v${version}`, tone: "pending" };
    }
    return { label: `${m.role === "expert" ? "Expert" : "Student"}${m.is_lead ? " (lead)" : ""}`, tone: "verified" };
  }

  const list = (rows: ProjectRow[]) => (
    <ul className="flex flex-col gap-2">
      {rows.map((p) => {
        const charter = latest.get(p.id);
        const s = state(p);
        return (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-accent"
            >
              <span className="min-w-0">
                <span className="block font-medium">{p.title}</span>
                <span className="block text-xs text-muted-foreground capitalize">
                  {p.status}
                  {charter && ` · Charter v${charter.version}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {charter && (
                  <Pill tone={isPaidModel(charter.model) ? "verified" : "ai"}>{MODEL_LABELS[charter.model]}</Pill>
                )}
                <Pill tone={s.tone}>{s.label}</Pill>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome, {user.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{intro[user.role]}</p>
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Open the admin console (audit, disputes, demo controls)
            </Link>
          )}
        </div>

        {user.role !== "admin" && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              {user.role === "sponsor" ? "Projects you sponsor" : "Your projects and invitations"}
            </h2>
            {mine.length ? (
              list(mine)
            ) : (
              <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                Nothing yet. A sponsor invites you after matching; invitations appear here.
              </p>
            )}
          </section>
        )}

        {others.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{user.role === "admin" ? "All projects" : "Discover projects"}</h2>
            {list(others)}
          </section>
        )}
      </main>
    </>
  );
}

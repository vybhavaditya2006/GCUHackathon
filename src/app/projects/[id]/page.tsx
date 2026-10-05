import { notFound } from "next/navigation";
import { AcceptCharterForm } from "@/components/AcceptCharterForm";
import { BriefPanel } from "@/components/BriefPanel";
import { CharterCard } from "@/components/CharterCard";
import { JudgeNote } from "@/components/JudgeNote";
import { Pill, type PillTone } from "@/components/Pill";
import { isPaidModel, MODEL_LABELS } from "@/lib/access";
import { formatRupees } from "@/lib/engine/computeSplit";
import { formatDate } from "@/lib/format";
import { getProjectView } from "@/lib/projects";

const sensitivityTone: Record<string, PillTone> = { low: "verified", medium: "pending", high: "alert" };

export default async function DiscoveryPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();
  const { project, charter, milestones, access } = view;

  const paid = charter ? isPaidModel(charter.model) : false;
  const budget = milestones.reduce((sum, m) => sum + m.amount, 0);
  const summary = project.public_summary.split("\n").filter(Boolean);

  const facts: [string, string][] = [
    ["Sponsor", [project.sponsor?.full_name, project.sponsor?.organisation].filter(Boolean).join(", ")],
    ["Budget", paid ? formatRupees(budget) : "No payment (credit and credentials)"],
    ["Timeline", `${formatDate(project.start_date)} to ${formatDate(project.end_date)}`],
    ["Commitment", `${project.hours_per_week} hours per week`],
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">1 · Discovery</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{project.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {charter && <Pill tone={paid ? "verified" : "ai"}>{MODEL_LABELS[charter.model]}</Pill>}
          <Pill tone={sensitivityTone[project.sensitivity]}>Sensitivity: {project.sensitivity}</Pill>
        </div>
      </div>

      <JudgeNote>
        Who can see what: the summary and charter are public, but the confidential brief is locked by a database
        row-level-security policy, not by this page. A signed-in non-member who calls the brief API gets a 403.
        Accepting the charter writes CHARTER_ACCEPTED to the ledger and unlocks it.
      </JudgeNote>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Public summary</h2>
            <p className="mt-2 text-sm text-muted-foreground">{project.problem_statement}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {project.required_skills.map((skill) => (
                <Pill key={skill}>{skill}</Pill>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Milestones</h2>
            <ol className="mt-3 flex flex-col divide-y divide-border text-sm">
              {milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <div>
                    <span className="font-medium">
                      {m.position}. {m.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">Accepted when: {m.acceptance_criteria}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {m.amount > 0 && <span className="font-medium text-verified">{formatRupees(m.amount)}</span>}
                    <span>due {formatDate(m.due_date)}</span>
                    <Pill className="capitalize">{m.status}</Pill>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          {charter ? (
            <CharterCard version={charter.version} model={charter.model} terms={charter.terms} />
          ) : (
            <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
              No charter has been published for this project yet.
            </section>
          )}

          <BriefPanel projectId={project.id} unlocked={access.unlocked} reason={access.reason}>
            {access.canAccept && charter && (
              <AcceptCharterForm
                projectId={project.id}
                version={charter.version}
                acknowledgement={
                  paid
                    ? `I have read Charter v${charter.version} and understand this is a ${MODEL_LABELS[charter.model].toLowerCase()} engagement: my share is computed by the charter from reviewed work.`
                    : `I have read Charter v${charter.version} and understand this is a ${MODEL_LABELS[charter.model].toLowerCase()} engagement: there is no payment, only credit and credentials.`
                }
              />
            )}
          </BriefPanel>
        </div>
      </div>
    </>
  );
}

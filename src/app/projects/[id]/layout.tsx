import { notFound } from "next/navigation";
import { JourneyStepper } from "@/components/JourneyStepper";
import { TopBar } from "@/components/TopBar";
import { getProjectView } from "@/lib/projects";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) notFound();

  return (
    <>
      <TopBar user={view.user} projectTitle={view.project.title} roleLabel={view.roleLabel} />
      <JourneyStepper projectId={view.project.id} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-6 py-6">{children}</main>
    </>
  );
}

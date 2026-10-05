import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isUuid } from "@/lib/projects";
import { submitMilestone, WorkError } from "@/lib/work";

/** The team lead (or the expert) submits a milestone for the sponsor's decision. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/milestones/[id]/submit">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Milestone not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    return Response.json(await submitMilestone(id, user.id));
  } catch (err) {
    if (err instanceof WorkError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

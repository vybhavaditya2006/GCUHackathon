import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { EscrowError, fund } from "@/lib/escrow";
import { isUuid } from "@/lib/projects";

/** The sponsor funds a draft milestone. No body: the amount is the milestone's own. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/milestones/[id]/fund">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Milestone not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    return Response.json(await fund(id, user.id));
  } catch (err) {
    if (err instanceof EscrowError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { EscrowError, release } from "@/lib/escrow";
import { isUuid } from "@/lib/projects";

/**
 * The sponsor accepts a submitted milestone. There is no request body: the
 * amounts are never taken from the client, the engine computes them on the server.
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/milestones/[id]/accept">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Milestone not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  try {
    // accept_milestone itself checks that this user is the sponsor (or an admin).
    return Response.json(await release(id, user.id));
  } catch (err) {
    if (err instanceof EscrowError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { exitMember } from "@/lib/corner";

/** A member leaves the project themselves. Their reviewed credit is kept and access ends at once. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/leave">) {
  const { id } = await ctx.params;
  // The user id comes from the session, so a member can only ever exit themselves.
  return handle(id, (user, projectId) => exitMember(projectId, user.id, null));
}

import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { runScoping } from "@/lib/drafts";

/** The sponsor runs the scoping agent. The result is a draft until the sponsor approves it. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/scoping">) {
  const { id } = await ctx.params;
  return handle(id, async (user, projectId) => {
    const result = await runScoping(projectId, user.id);
    return { draftId: result.draftId, seq: result.seq };
  });
}

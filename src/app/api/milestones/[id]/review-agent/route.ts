import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { runReview } from "@/lib/drafts";

/** The expert runs the review agent on a milestone. The result is a draft criteria check they own. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/milestones/[id]/review-agent">) {
  const { id } = await ctx.params;
  return handle(id, async (user, milestoneId) => {
    const result = await runReview(milestoneId, user.id);
    return { draftId: result.draftId, seq: result.seq };
  });
}

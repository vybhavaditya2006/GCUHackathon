import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { approveScoping } from "@/lib/drafts";

/** The sponsor approves the scoping agent's proposal. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/agent-drafts/[id]/approve-scope">) {
  const { id } = await ctx.params;
  return handle(id, (user, draftId) => approveScoping(draftId, user.id));
}

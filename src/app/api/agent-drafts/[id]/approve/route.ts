import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { approveDraft } from "@/lib/drafts";

const body = z.object({
  content: z.string().trim().min(20).max(8000),
  aiShare: z.number().min(0).max(1),
  aiDeclaration: z.string().trim().min(3).max(500),
});

/** The owner approves a research / coding draft, which turns it into a contribution. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agent-drafts/[id]/approve">) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Keep the draft text, set the AI share and add a declaration." }, { status: 400 });
  }
  return handle(id, (user, draftId) => approveDraft({ draftId, ownerId: user.id, ...parsed.data }));
}

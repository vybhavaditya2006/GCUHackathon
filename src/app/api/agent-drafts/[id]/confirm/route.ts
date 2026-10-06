import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { confirmReview } from "@/lib/drafts";

const body = z.object({ note: z.string().trim().max(300).default("") });

/** The expert confirms the review agent's criteria check. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/agent-drafts/[id]/confirm">) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "The note is too long." }, { status: 400 });
  return handle(id, (user, draftId) => confirmReview(draftId, user.id, parsed.data.note));
}

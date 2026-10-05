import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { invite } from "@/lib/matching";

const body = z.object({ userId: z.uuid(), role: z.enum(["student", "expert"]) });

/** The sponsor invites a candidate. The candidate still has to accept the charter. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/invite">) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a candidate to invite." }, { status: 400 });
  return handle(id, (user, projectId) => invite(projectId, user.id, parsed.data.userId, parsed.data.role));
}

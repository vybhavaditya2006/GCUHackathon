import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { accept, CharterError } from "@/lib/charter";
import { isUuid } from "@/lib/projects";

const body = z.object({
  // The member must tick "I understand this engagement model" before accepting.
  modelAcknowledged: z.literal(true),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/charter/accept">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Project not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Acknowledge the engagement model before accepting." }, { status: 400 });
  }

  try {
    // The user id comes from the verified session, never from the request body.
    const result = await accept(id, user.id, parsed.data.modelAcknowledged);
    return Response.json(result);
  } catch (err) {
    if (err instanceof CharterError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

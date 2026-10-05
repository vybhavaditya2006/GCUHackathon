import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { isUuid } from "@/lib/projects";
import { addReview, WorkError } from "@/lib/work";

const body = z.object({
  verdict: z.enum(["approved", "changes_requested", "rejected"]),
  impact: z.number().int().min(0).max(10),
  notes: z.string().trim().max(500).default(""),
});

/** An expert reviews a contribution and scores its impact. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/contributions/[id]/review">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Contribution not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Choose a verdict and an impact between 0 and 10." }, { status: 400 });
  }

  try {
    return Response.json(await addReview({ contributionId: id, reviewerId: user.id, ...parsed.data }));
  } catch (err) {
    if (err instanceof WorkError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

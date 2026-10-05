import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { resolveDispute } from "@/lib/corner";

const body = z.object({
  inFavourOf: z.enum(["team", "sponsor"]),
  resolution: z.string().trim().min(5).max(500),
});

/** A platform admin resolves a dispute. resolve_dispute itself checks the admin role. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/disputes/[id]/resolve">) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a side and write the reason." }, { status: 400 });
  return handle(id, (user, disputeId) => resolveDispute(disputeId, user.id, parsed.data.inFavourOf, parsed.data.resolution));
}

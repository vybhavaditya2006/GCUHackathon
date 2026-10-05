import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { adminDb } from "@/lib/db";
import { AgentError, runWorkspaceAgent } from "@/lib/drafts";

const body = z.object({
  agent: z.enum(["research", "coding"]),
  request: z.string().trim().min(10).max(600),
  notes: z.string().max(8000).default(""),
});

/** A member runs the research or coding agent for a milestone. The result is a draft they own. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/milestones/[id]/agent">) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Say what the agent should draft (at least 10 characters)." }, { status: 400 });
  }
  return handle(id, async (user, milestoneId) => {
    const { data: milestone } = await adminDb().from("milestones").select("project_id").eq("id", milestoneId).maybeSingle();
    if (!milestone) throw new AgentError("Milestone not found.");
    const result = await runWorkspaceAgent({
      ...parsed.data,
      projectId: milestone.project_id,
      milestoneId,
      userId: user.id,
    });
    return { draftId: result.draftId, seq: result.seq };
  });
}

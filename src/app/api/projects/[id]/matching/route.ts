import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { runMatching } from "@/lib/matching";

/** The sponsor (or an admin) runs matching: filters, score, then one LLM sentence per candidate. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/matching">) {
  const { id } = await ctx.params;
  return handle(id, async (user, projectId) => {
    const run = await runMatching(projectId, user.id);
    return { shortlisted: run.shortlisted.length, excluded: run.excluded.length, explainedByLlm: run.explainedByLlm };
  });
}

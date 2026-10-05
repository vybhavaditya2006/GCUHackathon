import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { userDb } from "@/lib/db";
import { append } from "@/lib/ledger";
import { isUuid } from "@/lib/projects";

/**
 * Returns the confidential brief. The read uses the caller's own session, so the
 * RLS policy decides: a signed-in non-member gets no row, and therefore a 403.
 * Every successful view is written to the ledger as BRIEF_VIEWED.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/brief">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Project not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const db = await userDb();
  const { data: brief } = await db
    .from("project_briefs")
    .select("content, updated_at")
    .eq("project_id", id)
    .maybeSingle();

  if (!brief) {
    return Response.json(
      { error: "The brief is locked. Only the sponsor and members who accepted the current charter can read it." },
      { status: 403 },
    );
  }

  const hash = await append({
    projectId: id,
    actor: user.id,
    event: "BRIEF_VIEWED",
    payload: { viewer: user.fullName, role: user.role },
  });

  return Response.json({ content: brief.content, updatedAt: brief.updated_at, viewedBy: user.fullName, hash });
}

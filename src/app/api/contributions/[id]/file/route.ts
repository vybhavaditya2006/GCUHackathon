import type { NextRequest } from "next/server";
import { openArtefact } from "@/lib/artefacts";
import { currentUser } from "@/lib/auth";
import { userDb } from "@/lib/db";
import { isUuid } from "@/lib/projects";

/** Download a contribution's file. Open to the sponsor, active team members and admins (RLS decides). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/contributions/[id]/file">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Contribution not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  // Read with the user's own session: someone outside the team gets no row, so no file.
  const db = await userDb();
  const { data: contribution } = await db
    .from("contributions")
    .select("project_id, artefact_name, artefact_hash")
    .eq("id", id)
    .maybeSingle();
  if (!contribution) return Response.json({ error: "Contribution not found." }, { status: 404 });

  const file = await openArtefact(contribution.project_id, contribution.artefact_hash);
  if (!file.ok) {
    return file.reason === "tampered"
      ? Response.json({ error: "The stored file no longer matches the fingerprint in the ledger." }, { status: 409 })
      : Response.json({ error: "No file is stored for this contribution (it predates file storage)." }, { status: 404 });
  }

  const name = contribution.artefact_name.replace(/[^\w.\- ]/g, "_");
  return new Response(file.bytes as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(file.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

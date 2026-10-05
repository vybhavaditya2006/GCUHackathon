import type { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { isUuid } from "@/lib/projects";
import { addContribution, WorkError } from "@/lib/work";

const MAX_BYTES = 1024 * 1024;

const fields = z.object({
  title: z.string().trim().min(3).max(120),
  // The AI-use declaration is mandatory on every upload.
  aiDeclaration: z.string().trim().min(3).max(500),
});

/** Upload a contribution (multipart form: file, title, aiDeclaration). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/milestones/[id]/contributions">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Milestone not found." }, { status: 404 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const parsed = fields.safeParse({ title: form?.get("title"), aiDeclaration: form?.get("aiDeclaration") });
  if (!parsed.success || !(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "Add a file, a title and an AI-use declaration (say \"No AI used\" if that is the case)." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "The file is larger than 1 MB." }, { status: 413 });
  }

  try {
    const result = await addContribution({
      milestoneId: id,
      authorId: user.id,
      title: parsed.data.title,
      fileName: file.name.slice(0, 120),
      bytes: new Uint8Array(await file.arrayBuffer()),
      aiDeclaration: parsed.data.aiDeclaration,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof WorkError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

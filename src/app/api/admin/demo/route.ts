import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { CornerError, demoControl, runDemoControl } from "@/lib/corner";

/** Admin-only demo controls: trigger one corner case on a project. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Demo controls are for platform admins." }, { status: 403 });

  const parsed = demoControl.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown demo control." }, { status: 400 });

  try {
    return Response.json({ message: await runDemoControl(user.id, parsed.data) });
  } catch (err) {
    if (err instanceof CornerError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}

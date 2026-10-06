import { currentUser } from "@/lib/auth";
import { verify } from "@/lib/ledger";

/** Re-hashes the whole chain in SQL (ledger_verify) and reports the first broken entry, if any. */
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(await verify());
}

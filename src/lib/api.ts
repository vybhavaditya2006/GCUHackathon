import "server-only";
import { currentUser, type CurrentUser } from "@/lib/auth";
import { AgentError } from "@/lib/agents/gateway";
import { MatchingError } from "@/lib/matching";
import { isUuid } from "@/lib/projects";

type Handler = (user: CurrentUser, id: string) => Promise<unknown>;

/**
 * Shared shell for the agent and matching routes: checks the id and the session,
 * runs the handler, and turns a domain "no" into a 409 the UI can show.
 */
export async function handle(id: string, handler: Handler): Promise<Response> {
  if (!isUuid(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    return Response.json(await handler(user, id));
  } catch (err) {
    if (err instanceof AgentError || err instanceof MatchingError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

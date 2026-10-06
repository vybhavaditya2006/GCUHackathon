import "server-only";
import { z } from "zod";
import { adminDb } from "@/lib/db";
import { completeJson } from "./groq";
import { buildMessages, costInRupees, type AgentDocument } from "./prompt";

// The one door to the LLM. Every agent call comes through runAgent, which checks
// the human owner, rate-limits them, wraps documents as data, validates the reply
// and records the result as a DRAFT with an AGENT_ACTION ledger entry.

export type AgentName = "scoping" | "matching" | "research" | "coding" | "review";

/** The agent could not run or its reply was unusable. Safe to show the user. */
export class AgentError extends Error {}

export interface AgentRun<T> {
  agent: AgentName;
  projectId: string;
  milestoneId?: string | null;
  /** The human who owns this run and gets the credit (and the responsibility). */
  ownerId: string;
  instructions: string;
  task: string;
  /** Only this project's material. Wrapped in <document> tags as data, never instructions. */
  documents: AgentDocument[];
  schema: z.ZodType<T>;
  inputSummary: string;
  /** One line for the ledger. */
  summarise: (output: T) => string;
}

export interface AgentResult<T> {
  draftId: string;
  seq: number;
  output: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

const MAX_CALLS_PER_MINUTE = 5;

const recorded = z.object({ draft_id: z.string(), seq: z.number().int() });

/** The owner must be the sponsor, an active member on the current charter, or (matching only) an admin. */
async function assertOwner(agent: AgentName, projectId: string, ownerId: string) {
  const db = adminDb();
  const [project, charter, membership, profile] = await Promise.all([
    db.from("projects").select("sponsor_id").eq("id", projectId).maybeSingle(),
    db.from("charters").select("version").eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("memberships").select("status, charter_version").eq("project_id", projectId).eq("user_id", ownerId).maybeSingle(),
    db.from("profiles").select("role").eq("id", ownerId).maybeSingle(),
  ]);
  if (!project.data) throw new AgentError("Project not found.");

  const isSponsor = project.data.sponsor_id === ownerId;
  const isCurrentMember =
    membership.data?.status === "active" && membership.data.charter_version === charter.data?.version;
  const isMatchingAdmin = agent === "matching" && profile.data?.role === "admin";
  if (!isSponsor && !isCurrentMember && !isMatchingAdmin) {
    throw new AgentError("Agents only run for an active member who accepted the current charter.");
  }
}

async function assertWithinRateLimit(ownerId: string) {
  const now = Date.now();
  // Upper bound too: the seeded drafts carry story dates in the future and must not count.
  const { count } = await adminDb()
    .from("agent_drafts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", new Date(now - 60_000).toISOString())
    .lte("created_at", new Date(now).toISOString());
  if ((count ?? 0) >= MAX_CALLS_PER_MINUTE) {
    throw new AgentError(`Rate limit: at most ${MAX_CALLS_PER_MINUTE} agent runs per minute. Try again shortly.`);
  }
}

export async function runAgent<T>(run: AgentRun<T>): Promise<AgentResult<T>> {
  await assertOwner(run.agent, run.projectId, run.ownerId);
  await assertWithinRateLimit(run.ownerId);

  const { system, user } = buildMessages(run.instructions, run.task, run.documents);

  let reply;
  try {
    reply = await completeJson(system, user);
  } catch (err) {
    throw new AgentError(`The language model could not be reached (${err instanceof Error ? err.message : "unknown error"}).`);
  }

  let json: unknown;
  try {
    json = JSON.parse(reply.text);
  } catch {
    throw new AgentError("The agent did not return valid JSON. Nothing was saved; try again.");
  }
  const parsed = run.schema.safeParse(json);
  if (!parsed.success) {
    throw new AgentError("The agent's reply did not match the expected shape. Nothing was saved; try again.");
  }

  const cost = costInRupees(reply.tokensIn, reply.tokensOut);
  const { data, error } = await adminDb().rpc("record_agent_draft", {
    p_project_id: run.projectId,
    p_milestone_id: run.milestoneId ?? null,
    p_agent: run.agent,
    p_owner_id: run.ownerId,
    p_input_summary: run.inputSummary,
    p_output: parsed.data,
    p_model: reply.model,
    p_tokens_in: reply.tokensIn,
    p_tokens_out: reply.tokensOut,
    p_cost: cost,
    p_summary: run.summarise(parsed.data).slice(0, 200),
  });
  if (error) throw new AgentError(error.message.replace(/^record_agent_draft:\s*/, ""));

  const saved = recorded.parse(data);
  return {
    draftId: saved.draft_id,
    seq: saved.seq,
    output: parsed.data,
    model: reply.model,
    tokensIn: reply.tokensIn,
    tokensOut: reply.tokensOut,
    cost,
  };
}

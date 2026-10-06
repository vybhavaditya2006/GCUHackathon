import "server-only";
import { AgentError, runAgent } from "@/lib/agents/gateway";
import { reviewInstructions, reviewSchema, reviewTask } from "@/lib/agents/prompts/review";
import { scopingInstructions, scopingSchema, scopingTask } from "@/lib/agents/prompts/scoping";
import { workspaceInstructions, workspaceSchema, workspaceTask } from "@/lib/agents/prompts/workspace";
import { removeArtefact, storeArtefact } from "@/lib/artefacts";
import { adminDb } from "@/lib/db";
import { sha256Hex } from "@/lib/integrity";

// What the agents are asked to do, and what happens to their drafts. The LLM
// call itself always goes through the gateway.

export { AgentError };

async function projectDocuments(projectId: string, includeBrief: boolean) {
  const db = adminDb();
  const [project, brief] = await Promise.all([
    db.from("projects").select("sponsor_id, title, problem_statement, public_summary").eq("id", projectId).maybeSingle(),
    includeBrief ? db.from("project_briefs").select("content").eq("project_id", projectId).maybeSingle() : null,
  ]);
  if (!project.data) throw new AgentError("Project not found.");
  const documents = [
    {
      name: "public_summary",
      text: `${project.data.title}\n${project.data.problem_statement}\n${project.data.public_summary}`,
    },
  ];
  if (brief?.data) documents.push({ name: "confidential_brief", text: brief.data.content });
  return { sponsorId: project.data.sponsor_id as string, documents };
}

/** Scoping agent: owned by the sponsor, reads the summary and the brief, proposes milestones. */
export async function runScoping(projectId: string, userId: string) {
  const { sponsorId, documents } = await projectDocuments(projectId, true);
  if (sponsorId !== userId) throw new AgentError("Only the project sponsor can run the scoping agent.");

  return runAgent({
    agent: "scoping",
    projectId,
    ownerId: userId,
    instructions: scopingInstructions,
    task: scopingTask,
    documents,
    schema: scopingSchema,
    inputSummary: "Public summary + confidential brief",
    summarise: (out) => `Proposed ${out.milestones.length} milestones + skills`,
  });
}

/** The sponsor approves the scoping proposal; approve_scoping_draft writes MILESTONES_APPROVED. */
export async function approveScoping(draftId: string, sponsorId: string) {
  const db = adminDb();
  const { data: draft } = await db.from("agent_drafts").select("output").eq("id", draftId).eq("agent", "scoping").maybeSingle();
  const parsed = scopingSchema.safeParse(draft?.output);
  if (!parsed.success) throw new AgentError("This scoping draft has no milestones to approve.");

  const { data, error } = await db.rpc("approve_scoping_draft", {
    p_draft_id: draftId,
    p_sponsor_id: sponsorId,
    p_milestones: parsed.data.milestones,
  });
  if (error) throw new AgentError(error.message.replace(/^approve_scoping_draft:\s*/, ""));
  return data as { milestones_created: boolean; seq: number };
}

export interface WorkspaceAgentRequest {
  agent: "research" | "coding";
  projectId: string;
  milestoneId: string;
  userId: string;
  request: string;
  /** Material the member pastes in for the agent to work from. */
  notes: string;
}

/** Research / Coding agent: owned by the member who runs it, reads this project's material only. */
export async function runWorkspaceAgent(input: WorkspaceAgentRequest) {
  // The gateway checks that the owner is an active member on the current charter,
  // which is exactly who may read the brief.
  const { documents } = await projectDocuments(input.projectId, true);
  if (input.notes.trim()) documents.push({ name: "member_notes", text: input.notes });

  return runAgent({
    agent: input.agent,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    ownerId: input.userId,
    instructions: workspaceInstructions[input.agent],
    task: workspaceTask(input.request),
    documents,
    schema: workspaceSchema,
    inputSummary: `Request: ${input.request.slice(0, 120)}`,
    summarise: (out) => out.title,
  });
}

export interface DraftApproval {
  draftId: string;
  ownerId: string;
  /** The owner's final text. If it differs from the agent's draft, the entry is marked as edited. */
  content: string;
  aiShare: number;
  aiDeclaration: string;
}

/**
 * The owner approves a research / coding draft. Only now does it become a
 * contribution: fingerprinted, credited to the human owner, AI share disclosed.
 */
export async function approveDraft(input: DraftApproval) {
  const db = adminDb();
  const { data: draft } = await db.from("agent_drafts").select("agent, output, project_id").eq("id", input.draftId).maybeSingle();
  const parsed = workspaceSchema.safeParse(draft?.output);
  if (!draft || !parsed.success) throw new AgentError("Draft not found.");

  // The approved text is the contribution's file: stored privately so the team can open it.
  const bytes = new TextEncoder().encode(input.content);
  const hash = sha256Hex(bytes);
  const newlyStored = await storeArtefact(draft.project_id, hash, bytes);

  const { data, error } = await db.rpc("approve_agent_draft", {
    p_draft_id: input.draftId,
    p_owner_id: input.ownerId,
    p_title: parsed.data.title,
    p_artefact_name: `${draft.agent}_draft_${input.draftId.slice(0, 8)}.md`,
    p_artefact_hash: hash,
    p_ai_share: input.aiShare,
    p_ai_declaration: input.aiDeclaration,
    p_edited: input.content.trim() !== parsed.data.content.trim(),
  });
  if (error) {
    if (newlyStored) await removeArtefact(draft.project_id, hash);
    throw new AgentError(error.message.replace(/^(approve_agent_draft|add_contribution):\s*/, ""));
  }
  return data as { contribution_id: string; seq: number };
}

/** Review agent: owned by the expert, reads the milestone's acceptance criteria and submission record. */
export async function runReview(milestoneId: string, userId: string) {
  const db = adminDb();
  const { data: milestone } = await db
    .from("milestones")
    .select("project_id, title, acceptance_criteria, status")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!milestone) throw new AgentError("Milestone not found.");

  const [membership, contributions] = await Promise.all([
    db.from("memberships").select("role").eq("project_id", milestone.project_id).eq("user_id", userId).maybeSingle(),
    db
      .from("contributions")
      .select("title, artefact_name, ai_share, similarity, flagged, ai_declaration, reviews(verdict, impact, notes)")
      .eq("milestone_id", milestoneId)
      .order("created_at"),
  ]);
  if (membership.data?.role !== "expert") throw new AgentError("Only the project's expert can run the review agent.");
  if (!contributions.data?.length) throw new AgentError("There is nothing to check yet: this milestone has no contributions.");

  return runAgent({
    agent: "review",
    projectId: milestone.project_id,
    milestoneId,
    ownerId: userId,
    instructions: reviewInstructions,
    task: reviewTask,
    documents: [
      { name: "acceptance_criteria", text: `Milestone: ${milestone.title}\nAccepted when: ${milestone.acceptance_criteria}` },
      { name: "submission_record", text: JSON.stringify(contributions.data) },
    ],
    schema: reviewSchema,
    inputSummary: "Acceptance criteria + submission record",
    summarise: (out) => `Criteria check: ${out.criteria.filter((c) => c.met === "yes").length} of ${out.criteria.length} met`,
  });
}

/** The expert confirms the criteria check; confirm_review_draft writes AGENT_DRAFT_APPROVED. */
export async function confirmReview(draftId: string, userId: string, note: string) {
  const { data, error } = await adminDb().rpc("confirm_review_draft", {
    p_draft_id: draftId,
    p_owner_id: userId,
    p_note: note,
  });
  if (error) throw new AgentError(error.message.replace(/^confirm_review_draft:\s*/, ""));
  return data as { seq: number };
}
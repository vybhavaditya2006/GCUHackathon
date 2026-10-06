import { z } from "zod";

export const scopingSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string().min(3).max(120),
        weeks: z.number().int().min(1).max(26),
        requiredSkills: z.array(z.string().min(1).max(40)).min(1).max(6),
        acceptanceCriteria: z.string().min(5).max(300),
      }),
    )
    .min(1)
    .max(4),
  team: z.string().min(3).max(200),
});

export type ScopingOutput = z.infer<typeof scopingSchema>;

export const scopingInstructions = [
  "You are the Scoping agent for a research collaboration platform.",
  "You help a sponsor turn a research problem into a small number of milestones a student team can deliver.",
  "Each milestone needs one acceptance criterion that a reviewer can check objectively (a number, a size, a count).",
  "You only draft: the sponsor edits and approves your proposal.",
].join(" ");

export const scopingTask = [
  "Using only the documents above, propose 2 to 3 milestones for this project.",
  'Reply as JSON: {"milestones":[{"title":string,"weeks":integer,"requiredSkills":[string],"acceptanceCriteria":string}],"team":string}.',
  '"team" is one short sentence on who is needed, e.g. "1 expert reviewer and 3 students".',
].join(" ");

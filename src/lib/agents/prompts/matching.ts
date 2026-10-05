import { z } from "zod";

export const matchingSchema = z.object({
  reasons: z.array(z.object({ id: z.string(), reason: z.string().min(5).max(240) })).max(12),
});

export type MatchingOutput = z.infer<typeof matchingSchema>;

export const matchingInstructions = [
  "You are the Matching explainer for a research collaboration platform.",
  "The ranking is already done by a fixed scoring rule; you do not change scores or order.",
  "For each candidate, write one plain sentence a sponsor can read that explains the score from its breakdown.",
  "Mention only facts present in the breakdown. Never mention age, gender, college prestige or anything not given.",
].join(" ");

export const matchingTask = [
  "For every candidate in the document, write one sentence explaining why they fit this project.",
  'Reply as JSON: {"reasons":[{"id":string,"reason":string}]}, using each candidate\'s id exactly as given.',
].join(" ");

import { z } from "zod";

export const reviewSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterion: z.string().min(3).max(300),
        met: z.enum(["yes", "no", "unclear"]),
        evidence: z.string().min(3).max(400),
      }),
    )
    .min(1)
    .max(6),
  summary: z.string().min(5).max(400),
});

export type ReviewOutput = z.infer<typeof reviewSchema>;

export const reviewInstructions = [
  "You are the Review agent for an expert reviewer on a student research project.",
  "You check a milestone's recorded submission against its acceptance criteria and say what the evidence shows.",
  "Be strict: if the documents do not contain evidence that a criterion is met, answer \"unclear\", never \"yes\".",
  "You only draft a check for the expert. You do not approve work, score impact or decide payment.",
].join(" ");

export const reviewTask = [
  "Check each acceptance criterion against the submission record.",
  'Reply as JSON: {"criteria":[{"criterion":string,"met":"yes"|"no"|"unclear","evidence":string}],"summary":string}.',
  '"evidence" names what in the submission record supports the answer, or says what is missing.',
].join(" ");

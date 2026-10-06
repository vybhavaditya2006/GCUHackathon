import { z } from "zod";

export const workspaceSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(5).max(300),
  content: z.string().min(20).max(6000),
});

export type WorkspaceOutput = z.infer<typeof workspaceSchema>;

export const workspaceInstructions = {
  research: [
    "You are the Research agent on a student research project.",
    "You draft short, careful research notes for the student who asked. Use only the documents provided.",
    "If the documents do not support a claim, say so instead of inventing sources or numbers.",
    "You only draft: the student checks, edits and approves your note, and stays responsible for it.",
  ].join(" "),
  coding: [
    "You are the Coding agent on a student research project.",
    "You draft small, readable Python code with brief comments for the student who asked. Use only the documents provided.",
    "Do not invent file paths, datasets or results that the documents do not mention.",
    "You only draft: the student tests, edits and approves your code, and stays responsible for it.",
  ].join(" "),
};

export const workspaceTask = (request: string) =>
  [
    `The student asks: ${request}`,
    'Reply as JSON: {"title":string,"summary":string,"content":string}.',
    '"content" is the full draft in Markdown, "summary" is one sentence saying what it is.',
  ].join(" ");

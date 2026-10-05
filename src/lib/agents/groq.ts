import "server-only";
import Groq from "groq-sdk";

// The Groq SDK lives here and nowhere else. Only gateway.ts may import this file.

export interface LlmReply {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

let client: Groq | undefined;

/** One chat completion that must come back as a JSON object. */
export async function completeJson(system: string, user: string): Promise<LlmReply> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!apiKey || !model) throw new Error("GROQ_API_KEY and GROQ_MODEL must be set in .env.local");
  client ??= new Groq({ apiKey, timeout: 60_000, maxRetries: 1 });

  const res = await client.chat.completions.create({
    model,
    temperature: 0.2,
    // Reasoning models spend part of this budget thinking before they answer.
    max_completion_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return {
    text: res.choices[0]?.message?.content ?? "",
    model: res.model ?? model,
    tokensIn: res.usage?.prompt_tokens ?? 0,
    tokensOut: res.usage?.completion_tokens ?? 0,
  };
}

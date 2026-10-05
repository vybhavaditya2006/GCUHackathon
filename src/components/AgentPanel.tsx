"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/Pill";

export interface AgentDraftView {
  id: string;
  agent: string;
  title: string;
  summary: string;
  content: string;
  status: string;
  tokens: number;
  cost: number;
  milestoneLabel: string;
}

const input = "rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-accent";

async function post(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error ?? "That did not work.";
  } catch {
    return "Network error. Try again.";
  }
}

function DraftCard({ draft }: { draft: AgentDraftView }) {
  const router = useRouter();
  const [content, setContent] = useState(draft.content);
  const [aiShare, setAiShare] = useState(80);
  const [declaration, setDeclaration] = useState(`Drafted by the ${draft.agent} agent; I checked and edited it.`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = draft.status === "pending";

  async function approve() {
    setBusy(true);
    const failure = await post(`/api/agent-drafts/${draft.id}/approve`, {
      content,
      aiShare: aiShare / 100,
      aiDeclaration: declaration,
    });
    setError(failure);
    setBusy(false);
    if (!failure) router.refresh();
  }

  return (
    <li className="rounded-md border border-border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{draft.title}</span>
        <Pill tone="ai" className="capitalize">
          {draft.agent} agent · owned by you
        </Pill>
        <Pill tone={pending ? "pending" : "verified"}>{pending ? "Draft, not a contribution yet" : "Approved"}</Pill>
        <span className="text-xs text-muted-foreground">
          {draft.milestoneLabel} · {draft.tokens} tokens · ₹{draft.cost.toFixed(2)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{draft.summary}</p>
      {pending && (
        <div className="mt-3 flex flex-col gap-3">
          <textarea
            aria-label="Draft text (edit before approving)"
            className={`${input} min-h-40 font-mono text-xs`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <label className="flex flex-col gap-1 text-xs font-medium">
              AI share: {aiShare}%
              <input type="range" min={0} max={100} step={5} value={aiShare} onChange={(e) => setAiShare(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              AI-use declaration
              <input className={input} value={declaration} maxLength={500} onChange={(e) => setDeclaration(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="rounded-md bg-verified px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Recording..." : "Approve as my contribution"}
            </button>
            <span className="text-xs text-muted-foreground">
              The credit and the responsibility are yours. The AI share is shown on the ledger and the receipt.
            </span>
          </div>
          {error && (
            <p role="alert" className="text-alert">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Run the research / coding agent and approve its drafts. A draft becomes a contribution only on approval. */
export function AgentPanel({
  milestones,
  drafts,
}: {
  milestones: { id: string; label: string }[];
  drafts: AgentDraftView[];
}) {
  const router = useRouter();
  const [milestoneId, setMilestoneId] = useState(milestones[0]?.id ?? "");
  const [agent, setAgent] = useState<"research" | "coding">("research");
  const [request, setRequest] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const failure = await post(`/api/milestones/${milestoneId}/agent`, { agent, request, notes });
    setError(failure);
    setBusy(false);
    if (!failure) {
      setRequest("");
      setNotes("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {milestones.length > 0 ? (
        <form onSubmit={run} className="flex flex-col gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 font-medium">
              Agent
              <select className={input} value={agent} onChange={(e) => setAgent(e.target.value as typeof agent)}>
                <option value="research">Research agent (notes)</option>
                <option value="coding">Coding agent (Python)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Milestone
              <select className={input} value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 font-medium">
            What should it draft?
            <input
              className={input}
              required
              minLength={10}
              maxLength={600}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. Outline the steps to quantise our model to under 10 MB"
            />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Your notes for it to work from (optional)
            <textarea className={`${input} min-h-20`} maxLength={8000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !milestoneId}
              className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
            >
              {busy ? "The agent is drafting..." : "Run the agent"}
            </button>
            <span className="text-xs text-muted-foreground">
              It reads this project&apos;s summary, brief and your notes only. The run is logged under your name.
            </span>
          </div>
          {error && (
            <p role="alert" className="text-alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">No milestone is open for work, so there is nothing to draft for.</p>
      )}

      {drafts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

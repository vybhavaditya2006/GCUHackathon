# The Executable Charter

**Team TeamNoClue · Gardenia 2K26 Hackathon (Garden City University) · 5–6 Oct 2026**

> Terms that run as code. Every rupee has a receipt.

A platform where research sponsors, experts, students and AI agents work on research projects
together. Every contribution is recorded in a tamper-evident, hash-chained ledger, and money and
credit are split by an executable charter: the project's terms stored as data that a pure function runs.

Core flow: **Contribution → Verification → Attribution → Credit / Payment**

This is a hackathon prototype. **No real money and no real personal data**: all users, projects,
payments, KYC and agreements are synthetic or simulated.

## Status

Phase 0 (scaffold) is done. Features are built phase by phase; see `docs/KICKOFF.md`.

## Tech stack

- Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui
- Supabase: Postgres, Auth (email + password), Storage, row-level security
- Groq LLM API (Llama model, id from `GROQ_MODEL`)
- Zod for validating API bodies and LLM JSON replies
- Vitest for unit tests

## Architecture

```
Browser (role dashboards) → Next.js route handlers /api/* → lib/* domain modules → Supabase (Postgres + Storage)
                                                         → lib/agents/gateway.ts → Groq
```

1. **One write path.** Every state change goes route → lib module → a Postgres function that writes
   the change and its ledger entry in one transaction.
2. **The engine is pure.** `src/lib/engine/computeSplit.ts` does no I/O and is unit-tested.
3. **One door to the LLM.** Only `src/lib/agents/gateway.ts` calls Groq.

## Getting started

Prerequisites: Node.js 20+ and a Supabase project.

```
npm install
```

Copy `.env.example` to `.env.local` and fill in the values. `SUPABASE_SECRET_KEY` and `GROQ_API_KEY`
are server-only; never commit `.env.local`.

```
npm run dev        # dev server at http://localhost:3000
npm test           # Vitest unit tests
npm run typecheck  # TypeScript, no emit
npm run lint       # ESLint
npm run build      # production build
```

Database setup (schema, RLS, ledger functions, seed) is added in Phase 1 under `supabase/`.

## Folder layout

```
src/app/              pages + /api route handlers
src/lib/db.ts         Supabase server clients (service role, and per-user with RLS)
src/lib/db.browser.ts Supabase browser client (publishable key)
src/lib/engine/       computeSplit + tests
src/lib/agents/       LLM gateway, Groq client, prompts
src/components/       shared UI
supabase/migrations/  schema, RLS, ledger functions
docs/                 design references, kickoff prompts, architecture doc
```

## AI tools used

Declared as required by the hackathon rules.

| Tool | Used for |
|---|---|
| Claude Code (Anthropic) | Scaffolding, writing and reviewing application code, SQL, tests and docs |
| Claude (Anthropic, chat/Cowork) | Planning, the project spec (`CLAUDE.md`), the paper PoC and the UI mock-ups in `docs/design/` |
| Groq-hosted Llama model | Runtime LLM inside the product (scoping, matching explanations, research/coding and review agents) |

<!-- Add any other AI tool a team member uses, before the final submission. -->

## Simplifications

Every mock is listed here with what production would use.

| In the prototype | In production |
|---|---|
| Users, projects and briefs are synthetic seed data | Real onboarding with consent and data-protection controls |

<!-- Add a row whenever something is mocked (payments/escrow, KYC, similarity check, ...). -->

## Team workflow

One branch per builder: `feat/frontend`, `feat/ledger-engine`, `feat/ai-agents`. Merge to `main` often,
with small commits and clear messages (`feat: ...`, `fix: ...`).

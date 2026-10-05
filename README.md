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

Phases 1 (database, RLS, ledger, seed), 2 (charter engine) and 3 (login, role-aware dashboard, Discovery page with the locked brief and charter accept) are done, as are Phase 4 (workspace: escrow funding, uploads with fingerprint and similarity check, expert reviews, milestone submission) and, from Phase 6, the Ledger page with Verify and the Credit & Payment page with receipts. Phase 5 (Groq gateway, scoping agent, matching with LLM explanations, research / coding agent with draft approval) and the Final Record page are built too. Still to build: the review agent and the admin demo controls for corner cases. Features are built phase by phase; see `docs/KICKOFF.md`.

## Tech stack

- Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui
- Supabase: Postgres, Auth (email + password), Storage, row-level security
- Groq LLM API (model id from `GROQ_MODEL`; currently `openai/gpt-oss-120b`, because no Llama chat model is offered to our Groq key)
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

### Database setup

In the Supabase dashboard, open **SQL Editor**. For each file, paste the whole file and press Run:

1. `supabase/migrations/001_schema.sql`: tables, RLS, ledger functions, state-changing functions.
2. `supabase/migrations/002_work_functions.sql`: review and milestone-submission functions.
3. `supabase/migrations/003_agent_functions.sql`: agent drafts, scoping approval and invitations.
4. `supabase/seed.sql`: synthetic demo data. The result row should show `chain_ok = true` and 46 ledger entries.

Every seeded user signs in with the password `demo1234`, for example `anjali@charter.test` (sponsor),
`kiran@charter.test` (expert), `priya@charter.test` (student) and `admin@charter.test` (admin).

`supabase/tests/ledger_check.sql` has the verify and tamper-demo snippets. `supabase/seed.sql` can be
re-run at any time to put the demo back to its starting state; `supabase/reset.sql` drops everything.

`npm test` runs the schema, seed, RLS and ledger checks against an in-process Postgres (PGlite) with a
small stand-in for Supabase's roles and auth schema. It does not touch the real project.

## Folder layout

```
src/app/              pages + /api route handlers
src/lib/db.ts         Supabase server clients (service role, and per-user with RLS)
src/lib/db.browser.ts Supabase browser client (publishable key)
src/proxy.ts          refreshes the session cookie; sends signed-out visitors to /login
src/lib/auth.ts       current user + profile (server)
src/lib/access.ts     pure "who can see what" rules that explain the brief lock
src/lib/ledger.ts     append(), verify() over the SQL functions
src/lib/charter.ts    accept (publish / new version come later)
src/lib/split.ts      loads the engine's inputs for a milestone and runs computeSplit
src/lib/escrow.ts     fund, and release (accept a milestone, store payouts + receipts); freeze / refund come later
src/lib/ledgerView.ts pure: ledger rows -> timeline rows and reviewed weights
src/lib/integrity.ts  SHA-256 of artefacts + mocked similarity score
src/lib/work.ts       contributions, reviews, milestone submission
src/lib/matchingScore.ts pure: hard filters + score out of 100
src/lib/matching.ts   filters -> score -> LLM explanation, and invitations
src/lib/drafts.ts     what each agent is asked, and draft approval
src/lib/engine/       computeSplit + tests
src/lib/agents/       LLM gateway, Groq client, prompts
src/components/       shared UI
supabase/migrations/  schema, RLS, ledger functions
supabase/seed.sql     synthetic demo data
supabase/tests/       SQL tests (PGlite) + manual verify / tamper snippets
docs/                 design references, kickoff prompts, architecture doc
```

## AI tools used

Declared as required by the hackathon rules.

| Tool | Used for |
|---|---|
| Claude Code (Anthropic) | Scaffolding, writing and reviewing application code, SQL, tests and docs |
| Claude (Anthropic, chat/Cowork) | Planning, the project spec (`CLAUDE.md`), the paper PoC and the UI mock-ups in `docs/design/` |
| Groq-hosted open-weight model (`openai/gpt-oss-120b`, set in `GROQ_MODEL`) | Runtime LLM inside the product (scoping, matching explanations, research/coding and review agents) |

<!-- Add any other AI tool a team member uses, before the final submission. -->

## Simplifications

Every mock is listed here with what production would use.

| In the prototype | In production |
|---|---|
| Users, projects and briefs are synthetic seed data | Real onboarding with consent and data-protection controls |
| Escrow is a database row with a made-up reference (`SIM-ESC-...`, `SIM-PAY-...`); no money moves | A regulated payment or escrow provider, with payouts to verified bank accounts |
| The login page lists the demo accounts, which all share one password | Real sign-up with email verification; no shared or displayed credentials |
| `verified`, `is_minor` and `guardian_consent` are plain flags set by the seed | KYC / institution verification and recorded guardian consent |
| Seeded history is inserted directly with backdated ledger timestamps, and seeded agent runs never called an LLM | All history comes from real use; no path can set a ledger timestamp |
| The similarity check compares an upload with one built-in text (`src/lib/integrity.ts`); `docs/demo/copied_cnn_notes.md` trips it | A real plagiarism and AI-content detection service |
| Agent cost is tokens x a made-up rupee price list (`src/lib/agents/prompt.ts`) | The provider's real billing, debited from the AI reserve |
| The research / coding agent reads the project summary, the brief and notes the member pastes in | Retrieval over this project's stored files only |
| Matching falls back to a fixed-wording reason when the LLM is unavailable (labelled on the page) | Same fallback, plus retries and monitoring |
| Uploaded files are fingerprinted (SHA-256) and then discarded; only the name and hash are kept | The file stored in a private Supabase Storage bucket with per-member access |
| Artefact fingerprints in the seed are hashes of a file name, not of a file | SHA-256 of the uploaded file in private storage |
| Track record (`proven_skills`, `completed_projects`) is stored on the profile | Derived from reviewed ledger entries |
| Credentials are `CREDENTIAL_ISSUED` ledger entries only | Signed, independently verifiable credentials |
| Tamper evidence relies on one hash chain held by the platform | Periodically anchor the latest hash somewhere public |

<!-- Add a row whenever something is mocked (payments/escrow, KYC, similarity check, ...). -->

## Team workflow

One branch per builder: `feat/frontend`, `feat/ledger-engine`, `feat/ai-agents`. Merge to `main` often,
with small commits and clear messages (`feat: ...`, `fix: ...`).

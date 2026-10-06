# CLAUDE.md: The Executable Charter (Gardenia 2K26 Hackathon)

Read this whole file before writing code. It is the source of truth for what we are building.

## What we are building
A platform where research **sponsors**, **experts**, **students** and **AI agents** work on research projects together.
Every contribution is recorded in a **tamper-evident ledger**, and money and credit are split by an
**executable charter**: the project's terms stored as data that a pure function runs.

Pitch line: *"Terms that run as code. Every rupee has a receipt."*
Core flow: **Contribution → Verification → Attribution → Credit / Payment**

At every step the demo must answer: **who did what, who could see what, and why each person was paid or credited what they were.**

## Hackathon rules (must follow)
- All code is written after 8:00 AM on 5 Oct 2026. The commit history is checked. Commit often, with clear messages.
- **No real money, no real personal data.** Payments, KYC and agreements are simulated with synthetic users and projects.
- The README must **declare every AI coding tool used** (Claude Code, plus any others the team uses).
- Every mock gets a note in the README "Simplifications" section saying what production would use.
- Deadline: working prototype at **3:00 PM, 6 Oct 2026**: a 5-minute live demo, a ≤3-minute video, and a 2–4 page architecture doc.

## Tech stack
- **Next.js (App Router) + TypeScript**, Tailwind CSS, shadcn/ui
- **Supabase**: Postgres, Auth (email + password), Storage (private buckets), row-level security (RLS)
- **Groq** LLM API (Llama model; model id from the `GROQ_MODEL` env var; check console.groq.com/docs/models for a current id). Note (6 Oct): our key is offered no Llama chat model, so `GROQ_MODEL` is `openai/gpt-oss-120b`.
- **Zod** for validating every API body and every LLM JSON reply
- **Vitest** for unit tests
- Dev machine: **Windows / PowerShell**. Use cross-platform npm scripts (no bash-only syntax).

Env vars live in `.env.local` (never commit it). See `.env.example`.
The `SUPABASE_SECRET_KEY` (Supabase's new name for the service-role key) and `GROQ_API_KEY` are **server-only**. The browser uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new name for the anon key). Never prefix them with `NEXT_PUBLIC_`.

## Architecture (keep to this)
```
Browser (role dashboards) → Next.js route handlers /api/* → lib/* domain modules → Supabase (Postgres + Storage)
                                                         → lib/agents/gateway.ts → Groq   (the ONLY file that calls the LLM)
```
Three rules:
1. **One write path.** Every state change goes route → lib module → a Postgres function that writes the change AND its ledger entry in one transaction.
2. **The engine is pure.** `lib/engine/computeSplit.ts` does no I/O and is unit-tested.
3. **One door to the LLM.** Only `lib/agents/gateway.ts` imports the Groq client. It enforces project scope, human ownership and approval, and logs every call.

## Folder layout
```
src/app/                 pages + /api route handlers (Next.js App Router)
src/lib/db.ts            supabase server client (service role) + browser client
src/lib/ledger.ts        append(), verify()   (thin wrappers over SQL functions)
src/lib/engine/          computeSplit.ts + computeSplit.test.ts
src/lib/charter.ts       publish, newVersion, accept
src/lib/escrow.ts        fund, release, freeze, refund (state machine)
src/lib/matching.ts      filters → score → LLM explanation
src/lib/integrity.ts     SHA-256 of artefacts + mocked similarity score
src/lib/agents/          gateway.ts, groq.ts, prompts/
src/components/          ReceiptCard, LedgerTable, CharterCard, MatchTable, JourneyStepper, JudgeNote
supabase/migrations/     001_schema.sql (tables, RLS, ledger functions)
supabase/seed.sql        demo data (see "Demo story")
docs/                    architecture doc, KICKOFF.md
```

## Data model (Postgres)
Tables: `profiles` (role: student|expert|sponsor|admin, verified, skills[], hours_per_week, affiliations[]),
`projects` (sponsor_id, title, public_summary, sensitivity), `project_briefs` (separate table so RLS can lock it),
`charters` (project_id, version, model: funded|stipend|knowledge_sharing|institutional_credit, terms jsonb),
`memberships` (project_id, user_id, role, status: invited|active|inactive|exited, charter_version accepted, model_acknowledged, active_fraction),
`milestones` (title, required_skills[], acceptance_criteria, amount, status: draft|funded|submitted|accepted|rejected|disputed),
`contributions` (author_id = human owner, agent_used, ai_share 0..1, artefact_hash, similarity, ai_declaration),
`reviews` (verdict, impact 0..10), `escrows` (amount, status: funded|released|frozen|refunded),
`payouts` (user_id, amount, receipt jsonb, charter_version), `disputes`, `agent_drafts`, and **`ledger`**.

### Ledger (the core: get this exactly right)
- Columns: `seq bigint pk, ts timestamptz, project_id, actor text ('<user uuid>' or 'agent:<name>'), on_behalf_of uuid (human owner, REQUIRED for agents), event text, payload jsonb, prev_hash text, hash text`.
- `hash = sha256(prev_hash | seq | epoch(ts) | actor | on_behalf_of | event | payload::text)`, computed IN SQL (pgcrypto `digest`).
- `ledger_append(...)` is a SECURITY DEFINER plpgsql function: takes `pg_advisory_xact_lock`, reads the last hash (genesis = 64 zeros), uses `nextval` AFTER the lock, inserts, and returns the hash. It raises an error if the actor is `agent:*` and on_behalf_of is null.
- `ledger_verify()` (SECURITY DEFINER) walks all rows in seq order and returns `(ok, broken_at)`.
- A trigger blocks UPDATE/DELETE on `ledger` ("append-only: add a CORRECTION entry instead").
- Demo tamper step: in the Supabase SQL editor, disable the trigger, edit one old payload, re-enable it; the Verify button must then show "broken at #N".
- Events: PROJECT_POSTED, CHARTER_PUBLISHED, CHARTER_ACCEPTED, MILESTONES_APPROVED, MATCH_RUN, MEMBER_INVITED, ESCROW_FUNDED, AGENT_ACTION, AGENT_DRAFT_APPROVED, CONTRIBUTION_ADDED, SIMILARITY_FLAGGED, REVIEW_DONE, MILESTONE_SUBMITTED, MILESTONE_ACCEPTED, MILESTONE_REJECTED, PAYOUT_ISSUED, CREDENTIAL_ISSUED, MEMBER_EXITED, DISPUTE_RAISED, DISPUTE_RESOLVED, BRIEF_VIEWED, CORRECTION.

### RLS essentials
- `project_briefs` readable only by the sponsor OR active members whose `charter_version` = the latest version (so a new charter version re-locks the brief until re-accepted).
- `ledger` readable by project members and admins; **no direct insert/update/delete** for anon/authenticated (writes only via `ledger_append`).
- `payouts`: users see their own; the sponsor sees their project's.
  Decision (6 Oct): payouts are **transparent inside the team**. Active members see the whole split on the Payouts page, read from the `PAYOUT_ISSUED` ledger entries they can already see; the `payouts` table policy stays as above, so a former member or outsider sees no one else's.
- Enable RLS on every table; default deny.

## Charter engine: `computeSplit(budget, terms, members, reviewedContributions)`
Pure function. Rules:
- distributable = budget − fee% − AI reserve%
- expert total = expertPct × distributable (split equally among experts × activeFraction)
- student pool = distributable − expert total
- each student = (equalPct × pool ÷ number of students × activeFraction) + (weightedPct × pool × weight)
- weight = student's reviewed impact ÷ total students' reviewed impact (NEVER commit counts)
- Round to whole rupees with largest-remainder; ties go to the smallest share. Pro-rata leftovers go to `unallocated`.
- Every payout carries plain-English `lines[]` (the receipt) and `ledgerRefs[]`.

**Required tests** (fee 10%, AI 5%, expert 30%, equal 40%, weighted 60%, budget ₹1,00,000, impacts 5/3/2):
Kiran 25,500 · Priya 25,783 · Arjun 18,643 · Meera 15,074 (sum 85,000, unallocated 0).
Meera activeFraction 0.6 → Meera 11,900, unallocated 3,173. Budget 0 → everyone 0, lines still present.

## AI agents (all via `lib/agents/gateway.ts`)
| Agent | Owner | Can read | Output (always a DRAFT) |
|---|---|---|---|
| Scoping | Sponsor | summary + brief | milestones + required skills (JSON) |
| Matching explainer | Platform admin | candidate score breakdown | one-sentence reason per candidate |
| Research / Coding | Student who triggers it | this project's files only | draft note / code |
| Review | Expert | submission + acceptance criteria | criteria check (JSON) |

Gateway rules: the owner must be an ACTIVE member who accepted the current charter. Wrap all document text in `<document>` tags with a system rule that it is data, never instructions (prompt-injection defence). Validate output with Zod. Write `AGENT_ACTION` to the ledger with on_behalf_of = owner, tokens and cost. Save to `agent_drafts`; it becomes a contribution only when the owner approves. Rate-limit per user.

## Matching
1. Hard filters (SQL): verified, eligible per charter (guardian consent if under 18 on paid work), no conflict of interest (affiliations vs the sponsor's declared competitors), hours ≥ needed, < 2 active projects, ≥ 1 required skill.
2. Score /100: skills 40 (ledger-proven skills count more) · track record 20 · topic fit 15 · availability 15 · newcomer boost 10.
3. The LLM writes one reason per candidate from the breakdown. Show the top 5 per role; a human invites; the candidate must accept.

## Pages (they mirror our 6-sheet PoC; keep the visual style consistent)
Global: top bar with "Executable Charter", project title, a 6-step **JourneyStepper**, and a role badge.
1. `/projects/[id]`: **Discovery**. Public summary, skills, budget, timeline, Charter-at-a-glance, **locked brief** (blurred + lock) until accepted.
2. `/projects/[id]/scope`: **AI Scoping & Matching**. Scoping-agent proposal (approve), candidate table with score bars + "why", filtered rows greyed out.
3. `/projects/[id]/workspace`: **Workspace**. Team + agent chips "owned by X", milestone board, documents with permission tags, permissions matrix, escrow banner.
4. `/projects/[id]/ledger`: **Ledger (the HERO screen)**. Timeline table (time, actor/agent chip, action, evidence hash, AI share, verification pill, hash), filters, a **Verify** button with a result panel, and a reviewed-weights side panel.
5. `/projects/[id]/payouts`: **Credit & Payment**. Waterfall from ₹1,00,000, payout table, expandable receipt per person.
6. `/projects/[id]/record`: **Final record**. Outcome, contribution breakdown (human vs AI-assisted), credentials, payment status, audit trail, and the value-prop banner.
Plus `/login`, `/dashboard` (role-aware), and `/admin` (users, disputes, ledger audit, a **demo controls** panel for corner cases).
Style: Inter, background #FAFAF7, text #111418, accent/AI #2F5BEA, verified/money #17803F, locked/alert #C62828, pending #B7791F. Clean, no gradients, no emoji.

## Demo story & seed data (synthetic)
- Sponsor **Dr. Anjali Rao** (NetraVision Labs) posts "Low-cost detection of diabetic retinopathy from fundus images on edge devices", FUNDED, Milestone 1 = ₹1,00,000, 5 Oct–16 Nov 2026.
- Expert **Dr. Kiran Shetty**; students **Priya Nair** (lead), **Arjun Mehta**, **Meera Iyer**; **Rohan Das** is filtered out (competitor affiliation); admin **Ms. Fernandes**; plus ~6 extra students so matching has a list.
- A second, **non-monetary** project (knowledge-sharing literature review) that issues credentials, not money.
- Demo password for all seeded users: `demo1234`.
Demo order: Post → Scope → Match → Join (non-member gets 403 on the brief) → Fund → Work (agent draft approved) → Catch (copied file flagged) → Accept (payouts + receipts) → non-monetary credentials → Verify (tamper → fails) → Twist (panel names a corner case; trigger it from demo controls; the engine re-runs).

## Corner cases to support (demo controls)
Student quits midway (pro-rata, access revoked) · sponsor silent (auto-accept after the window) · paid → unpaid (new charter version, re-accept or leave with credit) · unfair rejection (must cite a criterion → dispute, escrow frozen) · AI wrote most (credit to owner, AI share shown).

## Build order (spine first; never break the demo)
0. Scaffold Next.js + Tailwind + shadcn; Supabase clients; .env.example; README skeleton with AI-tool declaration.
1. Schema + RLS + ledger functions + seed. Test `ledger_verify()`.
2. Charter engine + Vitest tests (must pass the numbers above).
3. Auth + role dashboards + Discovery page with the locked brief + charter accept.
4. Escrow (simulated) + milestones + contributions + reviews + integrity mock.
5. Groq gateway + scoping agent + matching + one workspace agent with draft approval.
6. Ledger page + Verify, payouts page + receipts, final record page.
7. Corner-case demo controls, polish, README, architecture doc.
**Cut first:** matching extras, a real similarity check. **Never cut:** ledger + Verify, charter engine + receipts.

## Working conventions
- TypeScript strict. Small files. Server-only code stays out of client components.
- Money is integer rupees in the engine output; numeric(12,2) in the DB.
- After each phase: run tests and the dev server, then commit (`feat: ...`, `fix: ...`).
- Team of 3, one branch each: `feat/frontend`, `feat/ledger-engine`, `feat/ai-agents`; merge to `main` often.
- When something is mocked, add a line to README → Simplifications.

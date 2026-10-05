# Kickoff: prompts to paste into Claude Code, one phase at a time

Before Phase 0:
1. Create a Supabase project (supabase.com → New project). Copy the URL, anon key and service-role key.
2. Copy `.env.example` to `.env.local` and fill in the Supabase values plus `GROQ_API_KEY` and `GROQ_MODEL`.
3. Start Claude Code in this folder. It reads CLAUDE.md automatically.

After every phase: check that it runs, then ask Claude Code to commit.

---

## Phase 0: Scaffold (≈20 min)
```
Read CLAUDE.md fully. Then scaffold the project as described: Next.js App Router + TypeScript +
Tailwind + shadcn/ui inside this repo root (keep the existing docs/ folder; src/ is the app source;
remove the .gitkeep placeholders as needed). Add the Supabase server/browser clients in src/lib/db.ts,
the folder layout from CLAUDE.md, Vitest, and a README skeleton with an "AI tools used" section
(Claude Code) and a "Simplifications" section. Use cross-platform npm scripts (we're on Windows).
Don't build features yet. Run the dev server to confirm it starts, then commit.
```

## Phase 1: Database + ledger (≈60 min)
```
Write supabase/migrations/001_schema.sql exactly per CLAUDE.md: all tables, enums, RLS policies
(default deny), and the ledger functions ledger_hash, ledger_append (advisory lock, nextval after the
lock, agent needs an owner), ledger_verify (security definer) plus the append-only trigger.
Also write the SQL functions that change state together with their ledger entry (accept_charter,
fund_escrow, add_contribution, accept_milestone). Then write supabase/seed.sql with the demo story
data from CLAUDE.md. Tell me exactly how to run both in the Supabase SQL editor, and give me
a SQL snippet to test ledger_verify() and the tamper demo.
```

## Phase 2: Charter engine (≈30 min)
```
Implement src/lib/engine/computeSplit.ts as specified in CLAUDE.md (pure, largest-remainder rounding,
receipt lines, unallocated leftovers) and computeSplit.test.ts with the three required test cases.
Run the tests and show me they pass.
```

## Phase 3: Auth, roles, Discovery page (≈90 min)
```
Build Supabase email/password login, a role-aware /dashboard, the global layout (top bar,
JourneyStepper, role badge, JudgeNote strip) and the Discovery page /projects/[id] with the
Charter-at-a-glance card and the LOCKED confidential brief that unlocks only after charter
acceptance (enforced by RLS, not just the UI). The accept flow calls the accept_charter SQL function.
Follow the style tokens in CLAUDE.md.
```

## Phase 4: Escrow, work, reviews, integrity (≈90 min)
```
Implement lib/escrow.ts (state machine), milestone funding, contribution upload with SHA-256 artefact
hash and an AI-use declaration, the mocked similarity check (flag ≥ 0.8 → SIMILARITY_FLAGGED), and
expert reviews with an impact score. Every change goes through the SQL functions so it writes to the ledger.
Build the Workspace page (/projects/[id]/workspace) per CLAUDE.md.
```

## Phase 5: AI gateway, scoping, matching (≈2 h)
```
Implement src/lib/agents/groq.ts and gateway.ts per CLAUDE.md (owner checks, <document> wrapping,
Zod-validated JSON, AGENT_ACTION ledger entries, drafts needing owner approval, rate limit). Build the
Scoping agent, the matching pipeline (SQL filters → score → LLM reasons) and the Scope & Match page.
Add one workspace agent (Coding/Research) with draft → approve → contribution.
```

## Phase 6: Ledger, payouts, final record (≈2 h)
```
Build the Ledger page (the hero screen) with the timeline table, filters, the Verify button calling
ledger_verify() with a clear pass/fail panel, and the reviewed-weights panel. Build the Payouts page
(the accept_milestone flow runs computeSplit and stores receipts) and the Final Record page with
the audit trail and the value-prop banner. Include the non-monetary project's credential flow.
```

## Phase 7: Corner cases + polish (rest of the time)
```
Add an /admin demo-controls panel that triggers: student quits at X%, sponsor silent past the window,
paid → unpaid (new charter version that re-locks the brief), and unfair rejection → dispute.
Each writes ledger events and re-runs the engine. Then polish the UI, finish the README
(setup, AI tools, simplifications) and draft docs/architecture.md (2–4 pages).
```

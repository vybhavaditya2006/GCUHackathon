# Tech Stack Cheat Sheet: The Executable Charter

**The pitch in one line:** *A Next.js web app on Supabase Postgres. The money rules and the tamper-evident ledger run inside the database. Groq's LLM only ever writes drafts that a human approves.*

## 1. The stack at a glance

| Layer | Tool (version) | What it does for us | Where it lives |
|---|---|---|---|
| Framework | **Next.js 16.3.8** (App Router) | Pages and API routes in one TypeScript project | `src/app/**/page.tsx`, `src/app/api/**/route.ts` |
| UI | **React 19.2.8** | Components and interactive screens | `src/app`, `src/components` |
| Language | **TypeScript 5** | Types catch mistakes before runtime | everywhere |
| Styling | **Tailwind CSS 4** | Utility CSS classes written directly in the markup | every `.tsx` file |
| UI helpers | class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css | The shadcn/ui toolkit: style variants, merging class names, icons, animations | `src/lib/utils.ts` (`cn()`), `src/components/*` |
| Database | **Supabase** (managed **PostgreSQL**) | Tables, SQL functions, triggers, row-level security | `supabase/migrations/001`–`005` |
| Auth | **Supabase Auth** | Email and password login; sessions kept in cookies | `src/lib/auth.ts` |
| DB clients | **@supabase/supabase-js 2.117**, **@supabase/ssr 0.12** | Talk to Supabase from the server and the browser | `src/lib/db.ts`, `src/lib/db.browser.ts` |
| AI | **groq-sdk 1.6**, model `openai/gpt-oss-120b` | Fast hosted LLM for the scoping, matching, workspace (research and coding) and review agents | `src/lib/agents/` |
| Validation | **Zod 4.6** | Checks every API request body and every AI reply against a schema | API routes, `gateway.ts` |
| Server guard | **server-only** | Build fails if secret code is imported into the browser | `db.ts`, `auth.ts`, `gateway.ts`, `groq.ts` |
| Tests | **Vitest 5** (78 tests) + **PGlite 0.5.8** | Unit tests, plus our real SQL run on an in-memory Postgres | `*.test.ts`, `supabase/tests/schema.test.ts` |
| Lint | **ESLint 9** (`eslint-config-next`) | Code-quality rules | `eslint.config.*` |
| Scripts | `db:bundle`, `demo:dryrun` | Bundle the migrations for a one-paste setup; run about 60 live checks of the demo flow | `scripts/` |

## 2. Each piece explained, with an example from our app

### Next.js (App Router)
- **What it is:** A React framework. Each folder in `src/app` becomes a URL. A `page.tsx` file is a screen. A `route.ts` file is a backend API endpoint.
- **Example:** `/projects/[id]/payouts` is `src/app/projects/[id]/payouts/page.tsx`. Accepting the charter is a `POST` to `src/app/api/projects/[id]/charter/accept/route.ts`.
- **Why:** Front end and back end live in one repo and one language. That means no separate Express server, and one-click deploy on Vercel.
- **Server Components:** Pages render on the server, so the secret key and database queries never reach the browser.

### React 19 + Tailwind 4
- **React** builds the UI out of components (the task board, ledger table and payout cards).
- **Tailwind** puts styling right in the markup: `className="rounded-lg border p-4"`. There's no separate CSS file to keep in sync.
- **Our components are hand-built** (18 of them in `src/components`, for example `LedgerTable`, `TaskBoard`, `ReceiptCard` and `AgentPanel`). We used the shadcn/ui toolkit libraries rather than a component library: `cn()` in `utils.ts` (clsx + tailwind-merge) combines class names safely, `cva` handles style variants and `lucide-react` provides icons.

### Supabase = Postgres + Auth + RLS
- **What it is:** Hosted PostgreSQL with built-in login and an API. It's open source, and we use the free tier.
- **Keys:**
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are safe in the browser because RLS limits what they can do.
  - `SUPABASE_SECRET_KEY` is used only on the server and bypasses RLS. It is never in git; it lives in `.env.local`.
- **RLS (row-level security):** The database itself decides which rows each user can see. For example, a student who isn't on a project gets zero rows from that project, even if our code had a bug.
- **SQL functions (migrations 002–005):** Each action that matters is one database function that changes the data **and** writes the ledger entry in the **same transaction**. Either both happen or neither does. For example, `add_contribution` checks that the artefact hash is a valid SHA-256 hex, inserts the row and appends a `CONTRIBUTION_ADDED` ledger entry.
- **Why Supabase:** It's real Postgres, so transactions, triggers, `pgcrypto` and RLS work properly. Auth is built in, setup takes minutes, and it's free.

### The ledger (our "blockchain without the blockchain")
- **Hash chain:** `hash = SHA-256(prev_hash | seq | timestamp | actor | on_behalf_of | event | payload)`, computed **inside Postgres** by one SQL function, `ledger_hash()` (pgcrypto `digest`). Append and verify use the same function, so they can never disagree. `on_behalf_of` records the human owner when an AI agent acts.
- **One writer at a time:** `ledger_append_entry` takes `pg_advisory_xact_lock`, so two writes can never claim the same "previous hash".
- **Append-only:** The `ledger_append_only` trigger rejects any `UPDATE` or `DELETE` on the ledger table.
- **Verify:** `ledger_verify()` recomputes every hash. If someone edits a row (we demo this on entry #23), the chain breaks at exactly that row.
- **Why not a blockchain:** We have one trusted operator. Nobody needs consensus between strangers; we need tamper *evidence*. A hash chain gives that with no gas fees, no wallets and instant writes. Each entry could later be anchored to a public chain if needed.

### Charter engine (the money math)
- **Files:** `src/lib/engine/computeSplit.ts` and `fraction.ts`.
- **Exact fractions with BigInt, never floats.** `0.1 + 0.2 ≠ 0.3` in JavaScript, and you can't lose a rupee to rounding.
- **Largest-remainder rounding:** Everyone gets the floor of their share. The leftover rupees go to the largest remainders, and ties go to the smallest share. The total always equals the escrow exactly.
- **Worked example:** ₹85,000 splits as Kiran 25,500 · Priya 25,783 · Arjun 18,643 · Meera 15,074. If Meera leaves at 60%, she gets 11,900 and 3,173 stays unallocated.
- Every payout shows its **receipt:** the rule, the inputs and the arithmetic.

### Groq + gpt-oss-120b (the AI agents)
- **What Groq is:** An inference company with its own LPU chips. It hosts open models behind an OpenAI-style API and is very fast and cheap.
- **Model:** `openai/gpt-oss-120b`, OpenAI's open-weight 120B model hosted on Groq. We switched from Llama because our Groq key had no Llama chat model available. It's set through the `GROQ_MODEL` env var, so changing it is one line.
- **The one gateway:** Every AI call goes through `runAgent()` in `src/lib/agents/gateway.ts`. It:
  1. requires a **human owner**, who gets the credit and the responsibility
  2. **rate-limits** to 5 runs per minute per user
  3. wraps project files in `<document>` tags as **data, not instructions** (to defend against prompt injection)
  4. passes in **only this project's** material, never another project's
  5. **validates the reply with Zod**
  6. saves the result as a **DRAFT** and writes an `AGENT_ACTION` ledger entry with the model, tokens and cost
- **Agents:** scoping, matching, workspace (research/coding) and review (prompts in `src/lib/agents/prompts/`). Nothing an agent writes counts until a human approves it.

### Zod
- Validates data at runtime. TypeScript checks types only at compile time; Zod checks real incoming JSON.
- Used in every API route that changes data, and on every LLM reply. If the AI returns malformed JSON, we reject it rather than store it.

### Testing: Vitest + PGlite
- **Vitest** is a fast, Jest-style test runner. We have **78 tests**: the split engine, access rules, ledger integrity, matching score, the split-team rule and the prompt builder.
- **PGlite** is real Postgres compiled to WebAssembly and run in-process. `schema.test.ts` runs our actual migrations and ledger functions on it, so the SQL is tested without a cloud database.
- **`npm run demo:dryrun`** runs about 60 HTTP checks of the whole demo flow against the live Supabase project.

## 3. How a request flows (say this when asked "walk me through it")
1. Priya clicks **Submit contribution** in the browser.
2. A `POST` goes to `/api/milestones/[id]/contributions`, a Next.js `route.ts`.
3. The route checks the session with `currentUser()` (Supabase Auth cookie) and validates the body with **Zod**.
4. It calls the SQL function `add_contribution(...)` in **Postgres**.
5. In **one transaction**, Postgres inserts the contribution (server-assigned version, `builds_on`), hashes the ledger entry with **pgcrypto** and links it to the previous hash.
6. The response comes back and **React** re-renders the workspace. The ledger page now shows the new entry.

## 4. Collaboration and versioning (the Round 2 question)
- **Task board:** Work is split into owned tasks. Each person (and their AI) works on their own task.
- **Versions:** Every contribution has a `version` and `builds_on` (the version it extends). Versions are append-only and the server assigns the numbers, so nobody can overwrite anyone else's work.
- **Files:** We store a SHA-256 **fingerprint** of each file, not the file itself. That proves exactly which file was submitted without hosting confidential data.
- **Integration:** An expert reviews and approves a version before it counts toward credit.
- **How *we* built it:** Git and GitHub with feature branches (`feat/frontend`), an agreed interface contract (SQL function signatures and API routes) written first, and `CLAUDE.md` as the shared spec every AI session reads. That keeps three people and their AI assistants on the same plan.

## 5. Likely judge questions: short answers
- **"Why Next.js and not a separate backend?"** One language and one repo, with server-side rendering so secrets stay on the server. For a 3-person team in about 30 hours, that's the fastest correct choice.
- **"Is the money logic in the front end?"** No. The split is computed in a server-only TypeScript engine, and every state change happens in Postgres functions. The browser only displays results.
- **"What if two people write at the same time?"** The Postgres transaction and the advisory lock order the ledger writes, so there are no forks in the chain.
- **"Can an admin secretly edit history?"** The table is append-only by trigger. A direct edit by the database owner would break the hash chain, and `ledger_verify` shows exactly where.
- **"Why Groq?"** Speed (agent replies in about a second), an OpenAI-compatible API and a free tier. The model is a config setting, and the gateway design doesn't depend on which model we use.
- **"How do you stop the AI leaking sponsor data?"** It sees only the current project's documents. They're marked as data, outputs are drafts, and every call is logged with its cost.
- **"Who gets credit for AI work?"** The human owner of the run. The ledger records the AI-assisted share (Arjun's contribution was 70% AI-assisted), and the charter decides how that is weighted.
- **"Real payments?"** It's a simulated escrow (hackathon rule: no real money). A payment gateway such as Razorpay would plug in at `ESCROW_FUNDED` and the payout release.
- **"How do you know it works?"** 78 automated tests, SQL tested on PGlite, and a 60-check live dry run of the demo.
- **"Did you use AI to build it?"** Yes, and it's declared in the README's "AI tools used" table: Claude Code for code, SQL and tests, and Claude for planning, the spec and the PoC. We designed the architecture and reviewed every change.
- **"Scaling?"** Postgres handles this comfortably. The ledger lock is per append and takes microseconds. Next.js runs on Vercel serverless.

# HANDOFF: context from the planning conversation (read after CLAUDE.md)

Team **TeamNoClue** · Gardenia 2K26 Hackathon (Garden City University) · 5–6 Oct 2026
Problem: "Collaborative Research Ecosystem". Rounds: 1 Pitch (done) → 2 PoC on paper (3 PM, 5 Oct) → **3 Final demo (3 PM, 6 Oct; decides the ranking)**.

## Our solution: "The Executable Charter"
- Focus area **C: Fair rewards & governance**.
- The project charter is **structured data that an engine runs** (not a PDF). `computeSplit(charter, ledger)` produces every payout plus a plain-English **receipt** per person.
- **Hash-chained, append-only ledger** records every human and AI action with `on_behalf_of` = the human owner.
- **Corner cases are ledger events** (quit, sponsor silent, paid → unpaid), and the engine re-runs live.
- **AI agents are drafts-only**: a human approves and gets the credit; the AI share is disclosed; compute is paid from the 5% AI reserve.
- Tagline: *"Terms that run as code. Every rupee has a receipt."* · Flow: Contribution → Verification → Attribution → Credit / Payment.

## Decisions already made (don't re-open)
- Stack: Next.js + TypeScript + Tailwind + shadcn/ui, **Supabase** (cloud project already created), **Groq** LLM.
- **3 builders**: [Name 1] frontend/pages · [Name 2] ledger + escrow + charter engine · [Name 3] AI gateway + matching + integrity. A spare PC can run the `feat/ledger-engine` track in parallel (SQL + engine only; don't touch package.json).
- Charter numbers: fee 10%, AI reserve 5%, expert 30% of the remainder, students 40% equal + 60% by reviewed impact.
  Expected: Kiran 25,500 · Priya 25,783 · Arjun 18,643 · Meera 15,074 (= 85,000). Rounding: largest remainder, ties → smallest share.
- Hashing and verification live **in SQL** (pgcrypto) so there's one implementation and appends are atomic.

## Status right now
- [x] CLAUDE.md (full spec), docs/KICKOFF.md (phase prompts), .env.example
- [x] .env.local has the Supabase URL + publishable key. **Still to fill (by a human, never in chat):** SUPABASE_SECRET_KEY, GROQ_API_KEY, GROQ_MODEL
- [ ] Phase 0 scaffold: **not started**. No package.json yet.
- [ ] Add `Claude outputs/` to .gitignore

## Design references (in docs/design/)
- `Executable_Charter_PoC_6_Sheets.pdf`: **the UI target**. The 6 screens (Discovery, Scoping & Matching, Workspace, **Ledger = hero**, Credit & Payment, Final Record) with exact sample data, colours, the top bar + journey stepper, and a "Judge note" strip on each. Build the pages to look like this.
- `PoC_6_Pages.pdf`: the paper PoC submitted in Round 2 (architecture, data model, demo walk-through, agents, ledger, charter, security, corner cases, plan). If the build differs from it, note what changed and why. The final demo must explain any changes.

## Answers we've prepared for judges' questions (keep the product consistent with these)
- **How do we know someone left?** Every action is a ledger entry, so silence is measurable: no activity for 5 days → nudge; 7 days → inactive + lead alerted; after the charter's window the lead marks the exit (the member can dispute). Explicit "Leave project" also exists. Outcome: credit kept, pro-rata share, access revoked, replacement matched.
- **Leaving during a charter revision?** A new version re-locks the brief until re-accepted. Anyone who declines leaves under the version they signed, with full credit.
- **Confidentiality after leaving?** Access ends instantly; tiered brief (people see only what they need); per-viewer watermark + view logs make leaks traceable; the confidentiality clause survives exit and the signature is in the ledger.
- **Matching with many candidates?** Hard filters (verified, eligible, no conflict, hours, < 2 projects) → score /100 (skills 40, record 20, topic 15, availability 15, newcomer 10) → LLM writes a reason → top 5 shown → humans invite → candidate accepts.
- **AI used outside the platform?** It can't be detected perfectly, so: mandatory AI-use declaration on uploads, a similarity/AI-content flag → human review, and in-platform agents are the easier path (auto-logged credit).
- **Why not blockchain?** We have a trusted operator, so a hash chain gives tamper evidence for free. Anchoring the latest hash publicly is a stretch goal.

## Round 3 deliverables (due 3 PM, 6 Oct)
Working prototype seeded with one funded + one non-monetary project · repo with README + **AI-tool declaration** · 2–4 page architecture doc · ≤ 3 min demo video · 5-min live demo + 3 min of questions.
Demo script = the handout's 6 steps: Post → Scope/Match → Join/Fund → Work/Catch → Accept (+ non-monetary credentials) → Verify/Twist.

## How to continue
Start every Claude Code session with: "Read CLAUDE.md and docs/HANDOFF.md, check git log and the current state, then tell me which KICKOFF phase we're on and continue it."

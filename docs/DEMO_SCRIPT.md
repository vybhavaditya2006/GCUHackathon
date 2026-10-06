# Demo script: 5-minute live demo + ≤3-minute video

Follows the handout's six steps: **Post → Scope/Match → Join/Fund → Work/Catch → Accept → Verify/Twist.**
Every page in this script is built. Rehearse it once with `npm run demo:dryrun` (see the README), then reset.

## Before the panel arrives (checklist)

- [ ] Reset the data: `npm run db:bundle`, then paste `supabase/paste_2_seed.sql` into an empty Supabase SQL editor tab
      and Run (paste `supabase/paste_1_schema.sql` first if any migration changed). The result row shows 46 ledger
      entries and `chain_ok = true`. Confirm in the app: Milestone 1 is "submitted" and the Ledger page's Verify says 46 entries.
- [ ] `npm run dev` is running and `http://localhost:3000/login` opens.
- [ ] Open these tabs, each logged in (use separate browser profiles or a private window per person; password `demo1234`;
      the login page has click-to-fill buttons for all of them):
  1. **Sponsor**: `anjali@charter.test`
  2. **Expert**: `kiran@charter.test`
  3. **Student (member)**: `arjun@charter.test`
  4. **Non-member**: `rohan@charter.test`
  5. **Admin**: `admin@charter.test`, on `/admin` (demo controls for the twist)
  6. **Supabase SQL editor**, with the tamper block from `supabase/tests/ledger_check.sql` (step 4) pasted but not run
- [ ] Funded project: `/projects/b0000000-0000-4000-8000-000000000001`
- [ ] Unpaid (knowledge-sharing) project: `/projects/b0000000-0000-4000-8000-000000000002`
- [ ] Zoom the browser to 125%. Close notifications. Have the video file ready as a backup if Wi-Fi fails.

**Roles:** Driver (clicks) · Narrator (talks) · Q&A lead (questions about the ledger and the engine).

**Order matters.** Do the tamper step and its undo *before* any corner case. Each corner case is one-way until the
next reset (for example, after "paid to unpaid" the project stays unpaid), so trigger only the one the panel names.

---

## Live demo (5:00)

### 0:00–0:20 · Opening (Narrator)
> "Dr. Anjali has ₹1,00,000 and a real problem: detecting diabetic retinopathy on cheap edge devices. We'll follow her
> money from posting to payout, and at every step show who did what, who could see what, and why each person was paid."

### 0:20–1:00 · Step 1 · Post + locked brief (Discovery page)
- **Sponsor tab:** show the project: summary, skills, budget, timeline, **Charter at a glance**.
- **Non-member tab (Rohan):** same page, the confidential brief is **locked**.
> "The terms are public before anyone applies. The brief stays locked, and that's enforced by the database, not just
> hidden in the UI. Calling the API directly returns a 403."

### 1:00–1:40 · Step 2 · Scope + Match (Scoping & Matching page)
- **Sponsor tab:** the scoping agent's proposal, **approved by the sponsor**. Press **Run matching** (takes a few seconds):
  ranked candidates with score bars and a one-line "why", and **Rohan filtered out for a conflict of interest**
  (also: one unverified student, one under-18 without guardian consent).
> "The ranking is a fixed, published rule. The AI only writes the reason, from the score breakdown. A human invites,
> and the candidate still has to accept the charter."
- If the model is slow or down, the page shows fixed-wording reasons with a label. Say so and move on.

### 1:40–2:10 · Step 3 · Join + Fund (Discovery, then Workspace)
- **Student tab (Arjun):** the brief is **unlocked**, because he accepted Charter v1. Open it: "each view is logged".
- **Workspace:** point to the escrow banner: ₹1,00,000 held.
> "Arjun can see the brief only because he accepted this exact charter version. If the terms change, it locks again
> until he re-accepts. And the money is in escrow before any work starts."

### 2:10–2:50 · Step 4 · Work + Catch (Ledger page)
- **Sponsor tab → Ledger:** scroll the timeline. Point to:
  - **Entry #23:** Arjun's preprocessing code, written with the Coding agent, **AI share 70%**, owned and approved by Arjun, reviewed by Kiran.
  - **Entries #35–36:** the **similarity flag** on Meera's upload (82%), then her verified resubmission at #37.
> "Every action, human or AI, has a named human owner, evidence and a reviewer. AI work is credited to the person
> who directed it, with the AI share disclosed."
- *Only if there is time* (adds about a minute): **Sponsor** funds Milestone 2 in the Workspace; **Arjun** uploads
  `docs/demo/copied_cnn_notes.md` and it is flagged at 97% on the spot.

### 2:50–3:40 · Step 5 · Accept + receipts (Credit & Payment page)
- **Sponsor tab:** the page shows a live preview. Press **Accept milestone and release escrow** →
  Kiran ₹25,500 · Priya ₹25,783 · Arjun ₹18,643 · Meera ₹15,074 = ₹85,000.
- Open **Arjun's receipt** and read it.
> "This is the charter running as code. Arjun's ₹18,643 is his equal share plus 60% of the pool times his reviewed
> weight, and every line points back to the ledger."
- **Unpaid project → Credit & Payment:** accept its milestone: credentials are issued and no money appears anywhere.

### 3:40–4:30 · Step 6 · Verify + Twist
- **Ledger tab:** press **Verify the chain** → green, chain intact.
- **SQL editor:** run the tamper block (it edits entry #23's AI share). Back to the app → **Verify** → red, **broken at #23**.
> "Even an admin with raw database access can't quietly change history. The chain points to the exact entry."
- Run the **undo** block (step 5 of `ledger_check.sql`) straight away, so Verify is green again.
- **Twist (Admin tab, demo controls):** the panel names a corner case; trigger that one.
  - *Student quits midway:* pick Meera, 60%. Her access is gone at once (her tab now shows the brief locked).
    The money effect shows on a milestone that is **not yet accepted**: if Milestone 1 is still in preview, her share
    drops from ₹15,074 to ₹11,900 and ₹3,173 becomes unallocated. Once Milestone 1 is paid it does not change, so if
    you expect this twist, ask for it before step 5, or show it on a second reset.
  - *Sponsor silent:* auto-accepts the submitted milestone.
  - *Paid to unpaid:* new charter version → every member's brief re-locks; they re-accept or leave with credit.
  - *Unfair rejection:* press the three buttons in order: no criterion (refused), citing one, the team disputes
    (escrow frozen). Then resolve it in the Disputes panel.
> "It becomes an event in the ledger, the charter says what happens, and the engine recalculates."

### 4:30–5:00 · Close (Narrator)
- **Final record page:** outcome, human vs AI-assisted breakdown, credentials, audit trail.
> "Contribution, verification, attribution, then credit or payment. Terms that run as code, and every rupee has a receipt.
> Since Round 2, we moved hashing into the database and made the engine exact to the rupee. Happy to take questions."

---

## Video (≤ 3:00)

Record your screen with narration; no face cam needed. Use the same tabs, on a freshly reset database.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | Title slide or Discovery page | "The Executable Charter: terms that run as code, and every rupee has a receipt." |
| 0:15–0:40 | Discovery, sponsor vs non-member | "Terms are public before applying; the brief is locked by the database until the charter is accepted." |
| 0:40–1:05 | Scoping & Matching, run matching | "AI proposes milestones and explains each ranked candidate; conflicts are filtered; humans decide." |
| 1:05–1:30 | Arjun opens the brief; Workspace escrow banner | "Accept the charter and the brief unlocks. Money is in escrow before work starts." |
| 1:30–2:00 | Ledger timeline, entry #23 and the flag at #36 | "Every human and AI action has a named owner, evidence and a reviewer." |
| 2:00–2:30 | Accept → payouts → Arjun's receipt | "One engine turns the charter and the ledger into payouts, with a receipt for every rupee." |
| 2:30–2:55 | Verify green → tamper → Verify red at #23 | "Change history and the chain breaks at that exact entry." |
| 2:55–3:00 | Final record page | "Contribution → Verification → Attribution → Credit / Payment." |

## Quick Q&A answers
- **Why not blockchain?** We have a trusted operator, so a hash chain gives the same tamper evidence for free; anchoring the latest hash publicly is a stretch goal.
- **How are weights decided?** Expert-reviewed impact scores in the ledger, never commit counts.
- **Can a teammate see my payout?** Yes, inside the team: a split nobody can check is not a fair split. Outsiders and former members cannot.
- **Someone joins late?** Only people on the team when a milestone was submitted share in it, decided by ledger order.
- **Someone leaves?** Credit is kept, the equal share is pro-rata, access is revoked at once. In the prototype the exit is triggered by hand; detecting silence automatically (nudge at 5 days, inactive at 7) is designed but not built.
- **Confidentiality after leaving?** Access ends instantly and every view of the brief is in the ledger. Per-viewer watermarking is designed but not built.
- **AI used outside the platform?** A mandatory AI-use declaration, a similarity flag with human review, and in-platform agents make the honest path the easy one. The similarity check here is a mock.
- **Which model?** `openai/gpt-oss-120b` on Groq. We planned a Llama model, but our key is not offered one; the gateway is unchanged.

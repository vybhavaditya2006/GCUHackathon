# Demo video kit (≤ 3:00)

**The voiceover:** generate each block below with a text-to-speech voice and place it at its scene. Total narration is about 2 minutes 25 seconds at a normal pace, which leaves breathing room inside 3:00. Numbers and names are already spelled the way a TTS voice reads them well.

## Record (about 15 minutes, silent)

1. Reset the data (`paste_2_seed.sql`), start `npm run dev`, and open the tabs from `DEMO_SCRIPT.md`. Zoom to 125% and hide the bookmarks bar.
2. Record the browser window at 1080p, either with **Clipchamp → Record → Screen** or with **Win + Alt + R** (Xbox Game Bar). Record each scene as its own clip and **move slowly**: pause about 2 seconds on everything you want the viewer to read.
3. Don't talk. The voiceover goes on afterwards, so a fumble just means re-recording that one clip.

## Scenes and narration

### 1. 0:00–0:12
**Show:** Title card

> This is The Executable Charter, by Team No Clue. Terms that run as code, and every rupee has a receipt. Let's follow one funded research project, from posting to payout.

### 2. 0:12–0:37
**Show:** Sponsor (Anjali) on the funded project's Discovery page, then switch to Rohan's tab: brief locked

> Doctor Anjali posts a one lakh rupee project on detecting diabetic retinopathy. The charter, budget and milestones are public before anyone applies. But the confidential brief is locked. Rohan is not on the team, so he sees it locked, and that is enforced by the database, not just hidden on screen.

### 3. 0:37–1:02
**Show:** Sponsor: Scoping & Matching page. Press Run matching; hover over Rohan's 'conflict of interest' row

> An AI scoping agent drafted these milestones, and Anjali approved them. Matching ranks candidates with a fixed, published score. The AI only writes the one-line reason. Rohan is filtered out for a conflict of interest, and a human sends every invitation.

### 4. 1:02–1:25
**Show:** Arjun's tab: open the unlocked brief, then the Workspace escrow banner

> Arjun accepted charter version one, so the brief unlocks for him, and every view is logged. The workspace shows the money is already in escrow before any work starts. If the terms change, the brief locks again until he re-accepts.

### 5. 1:25–1:55
**Show:** Sponsor: Ledger page. Scroll to entry 23, then entries 35 to 37

> Everything lands in the ledger. Entry twenty-three is Arjun's preprocessing code, written with our coding agent. It shows a seventy percent AI share, owned and approved by Arjun, and reviewed by Kiran. Entries thirty-five and thirty-six flag a similarity match on Meera's upload, and her verified resubmission follows.

### 6. 1:55–2:27
**Show:** Sponsor: Credit & Payment. Press Accept milestone and release escrow, open Arjun's receipt, then accept on the knowledge-sharing project

> Anjali accepts the milestone, and the escrow is released. One engine turns the charter and the ledger into payouts: Kiran 25,500, Priya 25,783, Arjun 18,643 and Meera 15,074. That's exactly 85,000 rupees. Arjun's receipt shows every step of the arithmetic. On the knowledge-sharing project, the same flow issues credentials, and no money appears anywhere.

### 7. 2:27–2:50
**Show:** Ledger: Verify (green). Supabase SQL editor: run the tamper block. Back to the app: Verify (red at #23)

> Verify the chain, and it is intact. Now we edit entry twenty-three directly in the database, as an admin could. Verify again, and the chain breaks at exactly that entry. History cannot be changed quietly.

### 8. 2:50–3:00
**Show:** Final record page, then the end card

> Contribution, verification, attribution, credit and payment, all with receipts. The Executable Charter, by Team No Clue.

## Put it together in Clipchamp (free, built into Windows 11)

1. Drag in `title_card.png`, your clips in order, and `end_card.png`.
2. **Record & create → Text to speech:** pick an English (India) voice such as *Neerja* or *Prabhat*, at speed 1.0–1.1×. Paste one block per scene and line each one up with its clip. Trim or speed up the clips (1.25–1.5× is fine for scrolling) to fit the voice, not the other way round.
3. **Captions:** either turn on auto-captions, or import `captions.srt`. Captions help if the room is noisy.
4. Check the length is **≤ 3:00**, then export at **1080p**. Name it `TeamNoClue_ExecutableCharter_demo.mp4`.
5. Add the TTS tool you used to the README's *AI tools used* table, for example "Clipchamp text-to-speech: video voiceover".

**Prefer that Claude does the edit?** Put the raw clips (named `01.mp4` … `08.mp4`) and the voice audio in a `video/` folder in the repo. Claude will trim them, line them up with the voiceover, add the title and end cards and burn in the captions, then hand back the final MP4.

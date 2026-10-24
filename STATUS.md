# STATUS

What everyone (people and agents) is doing on Hear Me Out. **Every push must update this file**; the `pre-push` hook checks. How: `CLAUDE.md` → Workflow.

## In progress

<!-- One line each: what · who (agent) · branch -->
- Iterating on the combined build (main + Jose's latest design commits) · Anish (Claude Code) · `deploy-combined`

## Up next / on hold

- Muse labels: Anish decided Muse shows as connected with no demo labels (DECISIONS #40); `deploy-combined` now does that. Jose's labeled version is superseded, so check before re-adding labels.
- Maincloud needs `pnpm db:maincloud` for the duplicate-name fix (no schema change).
- Rest of the WhatsApp UI is on hold by request (the public-meetup QR is done). Not planned: showing it on the TV, which is a shared screen in the room.
- Trov: the repo was connected but the dashboard still lists no repos for the org (`repos: []`, branches "not connected"). A Trov admin needs to run **Sync GitHub** / give Trov's GitHub app access to jacky_boxie in the web app.

## Done recently

- Duplicate names no longer block joining; friends can rejoin under their name; WhatsApp group in friends games (phones + TV); Muse shown as connected again; Judge's double period fixed; new README screenshots. · Anish (Claude Code)
- Text-free event cover art instead of generated flyers, hardened game controls, labeled Muse demo, merged-attendee counts, Figma/UI verification (`b2532ea`…`dd46dd1`). · Jose
- WhatsApp QR on the public-meetup plan screen (phones), with a paste box for the invite. · diyab (Claude Code)
- Agent workflow: `AGENTS.md` router, full `CLAUDE.md` guide, this file, `pre-push` hook, Trov entry per push. · diyab (Claude Code)
- WhatsApp group link backend for people going to a meetup (`82e7020`). · diyab (Claude Code)
- `claude/modest-cerf-72dq1o` now matches Hear Me Out (`451aa73`); the older Pitch Fight code stays in history. · Prisha
- Muse connected + simulated auto-reservation; full venue cards on the secret ballot (`16b8e95`). · Anish
- Paper-and-ink UI for Find My People; simpler live pitch reactions (`cf545b9`, `caa973d`). · Jose
- Find my people matchmaking queue for public meetups (`ffb206d`). · Anish

## Other branches

- `deploy-combined`: `claude/modest-cerf-72dq1o` merged with `codex/find-my-people-design`, so it has everything from both. The branch we're iterating on.
- `codex/find-my-people-design`: same code as `claude/modest-cerf-72dq1o` up to `82e7020`, plus Jose's 4 commits after it (`b2532ea`…`dd46dd1`), which aren't on the default branch.
- `find-my-people`, `hear-me-out-build`: earlier Hear Me Out work, now included in the default branch.
- `hidden-gems`, `iteration-1`: the old Pitch Fight app (Next.js), superseded.

## Push log

<!-- Newest first. Template:
### YYYY-MM-DD · <branch> · <who> (<agent, if any>)
- **Changed:**
- **Verified:**
- **Not done / unverified:**
-->

### 2026-10-24 · deploy-combined · Anish (Claude Code)
- **Changed:** (1) Names: "Find my people" is one shared queue per category, so a stale or repeated first name (e.g. "anish") blocked everyone else and the queue capped at 8; now the queue has no cap or name rule and the matcher numbers clashes ("Sam 2"). In friends games, joining with a disconnected player's name takes back that seat from a new window; any other clash gets a number instead of an error (DECISIONS #45). (2) WhatsApp group now shows in friends games too: on phones after "I'm in" (with a hint before), and on the friends-game TV once someone adds the invite (#44). (3) Muse is shown as connected again with no demo wording: home pill, profile auto-pull, "Reserved · Booked by Muse"; the TV lobby's "Demo spot" button now shows the street (#40, `CLAUDE.md` rule). (4) The Judge's ruling no longer ends in ".." ("not 2am."). (5) README screenshots retaken in the new UI.
- **Verified:** `pnpm typecheck` clean, `pnpm test` 54/54 (new tests for the ruling text and name numbering), `pnpm sim` 24, `pnpm sim:strangers` 15, `pnpm sim:match` 16 (new: a stale queue name doesn't block, friends rejoin keeps the seat, a second "Zed" becomes "Zed 2"), `pnpm web:build:maincloud` built. In the browser against a local server: home "Muse is connected" dialog, profile auto-pull, a friends game through to the plan with "Reserved", the WhatsApp paste box, then the QR on the phone and on the TV; no console errors.
- **Not done / unverified:** Maincloud not republished (needs `pnpm db:maincloud`) and not deployed to Vercel. QR not scanned with a real phone. Trov: not posted (no access).

### 2026-10-24 · deploy-combined · Anish (Claude Code)
- **Changed:** new branch that merges the default branch (WhatsApp QR, STATUS.md, pre-push hook) with Jose's latest `codex/find-my-people-design` commits (cover art, hardened controls, labeled Muse demo). No conflicts. Jose's labeled Muse wording won the merge in `CLAUDE.md` and DECISIONS #40. No backend changes since `82e7020`, which Maincloud already runs.
- **Verified:** `pnpm typecheck` clean, `pnpm test` 53/53, `pnpm sim:match` 13 checks against a local server, `pnpm web:build:maincloud` built.
- **Not done / unverified:** didn't click through the WhatsApp QR or cover art in a browser on this merge. Trov: not posted (no access).

### 2026-10-24 · claude/modest-cerf-72dq1o · diyab (Claude Code)
- **Changed:** public meetups now show a WhatsApp card on each phone's plan screen once the meetup is confirmed, only to people who RSVP'd "I'm in". Someone going pastes the group invite (with a suggested group name to copy); then everyone going gets a QR code to scan, "Join WhatsApp group" and Share. New `qrcode` dependency in the web app. Not on the TV (shared screen).
- **Verified:** in the browser against a local server, a 3-person public meetup: no card at 2/3 RSVPs, card after "I'm in" confirmed it, a wa.me phone link was refused, a real invite showed the QR + buttons. `pnpm test` 45/45, `pnpm typecheck` clean.
- **Not done / unverified:** didn't scan the QR with a real phone camera.

### 2026-10-24 · claude/modest-cerf-72dq1o · diyab (Claude Code)
- **Changed:** `AGENTS.md` is now the entry point that sends every agent to `CLAUDE.md`; `CLAUDE.md` describes the build, stack and components plus the STATUS.md and Trov rules; the SpacetimeDB reference moved to `docs/SPACETIMEDB.md`; added this file and a `pre-push` hook that blocks pushes without a STATUS.md update. **Everyone: run `git config core.hooksPath .githooks` once in your clone** (a fresh `pnpm install` also does it).
- **Verified:** 5 hook tests (`scripts/pre-push.test.ts`) run the real hook against a throwaway repo; `pnpm test` 45/45; `pnpm typecheck` clean; this push itself went through the hook.
- **Not done / unverified:** the repo is not connected in Trov yet, so Trov's automatic digests won't appear until an admin connects it.

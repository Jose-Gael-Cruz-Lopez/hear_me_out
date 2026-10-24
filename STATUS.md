# STATUS

What everyone (people and agents) is doing on Hear Me Out. **Every push must update this file**; the `pre-push` hook checks. How: `CLAUDE.md` → Workflow.

## In progress

<!-- One line each: what · who (agent) · branch -->
- _Nothing in progress. Add your task here when you start._

## Up next / on hold

- WhatsApp: the card now shows in friends games too (Prisha lifted the hold, DECISIONS #47). Not planned: showing it on the TV, which is a shared screen in the room.
- Trov: the repo was connected but the dashboard still lists no repos for the org (`repos: []`, branches "not connected"). A Trov admin needs to run **Sync GitHub** / give Trov's GitHub app access to jacky_boxie in the web app.

## Done recently

- Plan screen redesign: TV is a one-screen dashboard, phone is one ticket; popular-times chart rebuilt. · Prisha (Claude Code)
- Busyness-aware plan time from Google popular times ("Go at 8:00, not 6:00"). · Prisha (Claude Code)
- Menu check: Apify Website Content Crawler proves diet claims with real dishes from each finalist's own site. · Prisha (Claude Code)
- Live Sway Meter: private leans during pitches, anonymous totals on the TV, Most Persuasive as it happens. · Prisha (Claude Code)
- WhatsApp QR on the public-meetup plan screen (phones), with a paste box for the invite. · diyab (Claude Code)
- Agent workflow: `AGENTS.md` router, full `CLAUDE.md` guide, this file, `pre-push` hook, Trov entry per push. · diyab (Claude Code)
- WhatsApp group link backend for people going to a meetup (`82e7020`). · diyab (Claude Code)
- `claude/modest-cerf-72dq1o` now matches Hear Me Out (`451aa73`); the older Pitch Fight code stays in history. · Prisha
- Muse connected + simulated auto-reservation; full venue cards on the secret ballot (`16b8e95`). · Anish
- Paper-and-ink UI for Find My People; simpler live pitch reactions (`cf545b9`, `caa973d`). · Jose
- Find my people matchmaking queue for public meetups (`ffb206d`). · Anish

## Other branches

- `codex/find-my-people-design`: Jose's branch, merged into `claude/modest-cerf-72dq1o` up to `dd46dd1`; it does not have the sway / menu check / timing / plan redesign work yet.
- `find-my-people`, `hear-me-out-build`: earlier Hear Me Out work, now included in the default branch.
- `hidden-gems`, `iteration-1`: the old Pitch Fight app (Next.js), superseded.

## Push log

<!-- Newest first. Template:
### YYYY-MM-DD · <branch> · <who> (<agent, if any>)
- **Changed:**
- **Verified:**
- **Not done / unverified:**
-->

### 2026-10-24 · claude/modest-cerf-72dq1o · Prisha (Claude Code)
- **Changed:** Live Sway Meter during pitches (private `lean` table seeded from the pre-vote, `setLean`, `room_sway` view exposing only totals; TV bar + "Most persuasive right now"; phone lean picker). Menu check (`menu_proof` table, `menu_check` job: Apify Website Content Crawler on finalists' own sites, real dishes shown on finalist cards, ballot, verdict and plan; Muse reads menus when connected, otherwise a marker matcher; never invents dishes). Busyness-aware plan time (popular times kept as `option.busyness`, plan picks a less packed slot everyone can make, plan stores both times). Plan screen redesign (TV dashboard, phone ticket, rebuilt chart). New columns use defaults, so `pnpm db:publish` needs no wipe. Merged diyab's workflow/WhatsApp QR and Jose's `dd46dd1` UI work. DECISIONS #44–46.
- **Verified:** `pnpm test` 69/69, `pnpm typecheck` clean, `pnpm sim` 36/36 (11 new checks: sway privacy/totals, menu check queued/never spinning/offline honest, timing). Live: `pnpm sim --live` crawled 4 real restaurant sites in 18–40 s (3 of 4 confirmed with real dishes); sway bar moved on the TV within ~1 s of a phone tap; plan screens checked in a browser at 1440×900 and 390×844 with no console errors; 5–7 of 24 real restaurants shift to a quieter time on a weekend evening.
- **Not done / unverified:** Muse menu reading untested (no `META_API_KEY`); not checked on a real phone or TV; Maincloud not republished. Trov: not posted (no access).

### 2026-10-24 · claude/modest-cerf-72dq1o · diyab (Claude Code)
- **Changed:** public meetups now show a WhatsApp card on each phone's plan screen once the meetup is confirmed, only to people who RSVP'd "I'm in". Someone going pastes the group invite (with a suggested group name to copy); then everyone going gets a QR code to scan, "Join WhatsApp group" and Share. New `qrcode` dependency in the web app. Not on the TV (shared screen).
- **Verified:** in the browser against a local server, a 3-person public meetup: no card at 2/3 RSVPs, card after "I'm in" confirmed it, a wa.me phone link was refused, a real invite showed the QR + buttons. `pnpm test` 45/45, `pnpm typecheck` clean.
- **Not done / unverified:** didn't scan the QR with a real phone camera.

### 2026-10-24 · claude/modest-cerf-72dq1o · diyab (Claude Code)
- **Changed:** `AGENTS.md` is now the entry point that sends every agent to `CLAUDE.md`; `CLAUDE.md` describes the build, stack and components plus the STATUS.md and Trov rules; the SpacetimeDB reference moved to `docs/SPACETIMEDB.md`; added this file and a `pre-push` hook that blocks pushes without a STATUS.md update. **Everyone: run `git config core.hooksPath .githooks` once in your clone** (a fresh `pnpm install` also does it).
- **Verified:** 5 hook tests (`scripts/pre-push.test.ts`) run the real hook against a throwaway repo; `pnpm test` 45/45; `pnpm typecheck` clean; this push itself went through the hook.
- **Not done / unverified:** the repo is not connected in Trov yet, so Trov's automatic digests won't appear until an admin connects it.

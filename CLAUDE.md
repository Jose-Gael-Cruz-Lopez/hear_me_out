# Hear Me Out — agent notes

The guide for **every** coding agent on this repo (`AGENTS.md` sends non-Claude agents here).

Build plan: `SPEC.md`. Deviations and choices: `DECISIONS.md` (append when you decide something). SpacetimeDB 2.x rules: `docs/SPACETIMEDB.md` (shipped by `spacetime init`) and the SpacetimeDB plugin skills. What's in flight: `STATUS.md`.

## What it is

A party game that turns "where do we go?" into a plan. A TV runs the show, players join from their phones, the AI finds real nearby places that fit everyone, each player defends a place in a 30 s pitch, the AI fact-checks claims live, everyone votes, and the winner becomes the plan (time, poster, calendar invite, RSVPs). **Strangers mode** turns it into small public meetups: "Find my people" matches 3–4 strangers who share approved tags into a host-less room, and two groups that pick the same place can merge tables.

## Stack

| Layer | Tech |
| --- | --- |
| Live state + all game rules | SpacetimeDB 2.13 TypeScript module (reducers, private tables + views, scheduled timers) |
| Web client | Vite 7, React 18, wouter, Tailwind 4, motion, Three.js (crowd scenes), canvas-confetti |
| AI worker | Node + tsx orchestrator; Meta Muse (Spark, Image, Voice Transcribe) via the OpenAI SDK at `https://api.meta.ai/v1`, zod-validated |
| Real places | Apify `compass/crawler-google-places`; recorded fixtures for `DEMO_MODE` |
| Social vibe | `actors/vibe-profiler` Apify actor (Instagram/TikTok/Facebook → tags) |
| Monorepo | pnpm workspaces (`pnpm@12.15`), TypeScript ~5.6, vitest |
| Deploy | SpacetimeDB Maincloud + static web on Vercel (`pnpm web:build:maincloud`) |

## Layout

- `apps/module` — SpacetimeDB TypeScript module. `schema.ts` (all tables), `core.ts` (helpers + phase machine), `reducers/*`, `cleanup.ts` (AI fallbacks), `logic/*` (pure, unit-tested, also imported by the orchestrator as `@hmo/module/logic/*`).
- `apps/orchestrator` — Node worker that connects as the admin identity, claims `ai_job`s and calls `finish_*` reducers. Muse/Apify/fixtures live in `src/services`.
- `apps/web` — Vite + React client: TV (`/host/:code`) and player (`/play/:code`).
- `packages/bindings` — generated client bindings (`pnpm db:generate`), shared by web, orchestrator and the sim.
- `packages/shared` — pure TS used everywhere (venue normalization, hours, geo, diet, .ics).
- `fixtures/` — recorded real Apify data for DEMO_MODE.
- `actors/vibe-profiler` — Apify actor that turns a person's own public social account into tags.
- `scripts/` — `sim*.ts` end-to-end simulators against a local server, `mock-muse.ts`, `demo-player.ts`.
- `.githooks/pre-push` — enforces the `STATUS.md` rule (see Workflow).

## Components

**Module (`apps/module/src`)**
- `reducers/room.ts` create/join rooms (incl. 18+ public join), bots, kick, start/skip/end · `reducers/profile.ts` profile submit + tag approval (`my_profile_draft`) · `reducers/game.ts` warm-up, secret prevote, pitches (audio/typed), reactions, objections, votes, RSVPs · `reducers/jobs.ts` `claim_job` / `fail_job` / `finish_*` for the orchestrator (admin only) · `reducers/lifecycle.ts` init, connect/disconnect, phase timer (`advance_phase`), janitor · `reducers/strangers.ts` public lobbies, lobby matching, block & report, merge votes · `reducers/matchmaking.ts` + `queue.ts` "Find my people" queue and matcher · `reducers/groupchat.ts` WhatsApp group link for people going (private `group_chat` + `my_group_chat` view).
- `logic/*` pure rules: `assign`, `bots`, `codes`, `fallbacks`, `match`, `slot`, `tally`, `text`, `timing`, `whatsapp`.

**Orchestrator (`apps/orchestrator/src`)** — `runner.ts` claims jobs, `jobs/handlers.ts` one handler per job kind, `services/` `muse.ts`, `venues.ts`, `curation.ts`, `factcheck.ts`, `audio.ts`, `social.ts`, `geocode.ts`, `offline.ts` (fallback copy), `prompts/`.

**Web (`apps/web/src`)** — routes in `App.tsx`: `/` Home, `/host/:code` TV (`host/`), `/play/:code` player (`play/`), `/lobbies` public lobby browser, `/meet` Find my people. Shared pieces in `components/` (Ink, Crowd, Muse, Safety, MergeBanner, ReactionLayer, WhatsAppGroup (QR + invite for people going), …) and `lib/` (connection, room, muse (simulated connection, see Rules), sound, time, toast).

## Commands

- `spacetime start` — local server (port 3000).
- `pnpm db:publish` / `pnpm db:reset` (wipes data) then `pnpm db:generate` after schema changes.
- `pnpm orchestrator`, `pnpm web`, `pnpm sim` (end-to-end, needs the local server), `pnpm test`, `pnpm typecheck`.
- More sims: `pnpm sim:strangers`, `pnpm sim:match`. `pnpm dev` runs orchestrator + web together.

## Rules

- Every AI call needs a timeout and an offline fallback; the module also has a fallback per job kind.
- Never present fixtures or offline content as live AI; label them. Exception (product decision, DECISIONS.md #40): the Muse connection, its connectors and the reservation are simulated and deliberately unlabeled in the UI; keep them marked in code (`apps/web/src/lib/muse.ts`). Nothing is booked and no account is read.
- Breaking schema changes are refused on publish: append columns with `.default(...)` or add tables.

## Workflow: STATUS.md + pre-push hook (required)

`STATUS.md` is the team's shared view of what every person and agent is doing.

1. **Start of a task:** read `STATUS.md`, then add a line under **In progress**: what, who (person or agent), branch.
2. **Every push must include a `STATUS.md` change** in at least one of the commits being pushed. Add a **Push log** entry at the top of that section:
   ```
   ### YYYY-MM-DD · <branch> · <who> (<agent, if any>)
   - **Changed:** what this push does, in plain words
   - **Verified:** tests/sims you ran and their result
   - **Not done / unverified:** anything left, or "nothing"
   ```
   Then move your task: **In progress** → **Done recently** when finished, or update its line.
3. The hook lives in `.githooks/pre-push`. Turn it on once per clone: `git config core.hooksPath .githooks`. A fresh `pnpm install` also does it (`prepare`), but pnpm skips `prepare` when `node_modules` is already up to date, so existing clones should run the git command. Check with `git config core.hooksPath` (prints `.githooks`).
4. The hook refuses a push whose new commits never touch `STATUS.md`, and prints what to add. Deleting a branch and pushing commits that are already on the remote are allowed. `git push --no-verify` skips it: only when a person says so, and note it in the next entry.

## Trov: one feed entry per push (required)

The team tracks work in **Trov** (org `cal-hacks`, repo `Jose-Gael-Cruz-Lopez/jacky_boxie`). The team asked for a `Shipped:` entry per push, so after every successful push an agent with the Trov tools calls `append_feed` with `repo: "Jose-Gael-Cruz-Lopez/jacky_boxie"`:

- `summary`: `Shipped: <what>` (≤ 100 characters).
- `brief`: 1–2 plain sentences (≤ 280 characters) on what it means for players or the team. No file names or jargon.
- `body`: `**What** … **Why** … **Impact** … **Follow-up** …` (same facts as the Push log entry).
- `commits`: the pushed shas (`git log --format=%H <remote>..HEAD` before pushing). `tags`: pick from `list_tags` (`architecture`, `infra`, `api`, `ui`, `data`, `auth`).

Agent entries are **staged**: a person promotes them in Trov's Triage. Trov also writes its own digest from the commits about 45 minutes after a push, once the repo is connected in Trov (Org settings › Repositories). An agent without Trov access writes "Trov: not posted (no access)" in its Push log entry.

# 🥊 Pitch Fight

**A Jackbox-style party game for deciding where to go.** Friends join on their phones, the AI host finds
real places nearby that fit everyone, assigns each player a place to defend (usually *not* their favorite)
with a ridiculous persona, everyone pitches, everyone votes, and the winner becomes the group's real plan,
with a calendar invite and RSVPs.

Built at Cal Hacks 13.0.

```
LOBBY → PROFILE → OPTIONS → PITCH → SHOWTIME → VOTE → RESULT → PLAN
 join    5 tap      AI picks   30s voice   AI host    one vote   winner   time everyone's
 by code questions  real spots or text     reacts     each       reveal   free + .ics + RSVP
```

## How it works

| Piece | Where | What it does |
|---|---|---|
| **Big screen** | `web/components/host/HostScreen.tsx` | Host laptop/TV. Room code + QR, live player list, posters, showtime, results. The AI host talks through the browser's `speechSynthesis` (with captions + mute). |
| **Phone controller** | `web/components/play/PlayerScreen.tsx` | Join, tap questions (with a share-approval screen), see your assignment, record or type a pitch, vote, RSVP. |
| **Game board** | `spacetime/src/index.ts` | SpacetimeDB module. All game state + **all rules** live in reducers. |
| **AI host** | `web/lib/ai/muse.ts` | Every Meta Muse call, behind one `AiHost` interface, with a deterministic mock. |
| **AI routes** | `web/app/api/*` | `options`, `react`, `transcribe`, `poster`, `plan`, `status`. Keys never leave the server. |
| **Places** | `scripts/fetch-places.ts` → `web/data/places/*.json` | Apify pre-fetch → cache; the game only reads the cache. |
| **Hard filters** | `web/lib/game/filter.ts` | Budget, diet, open at the plan time, distance, enforced in code. The AI only ever chooses from places that already passed. |

## Sponsor tools

### SpacetimeDB: the live game board
SpacetimeDB is the realtime backend, **not** the AI host. Tables: `lobby`, `player`, `profile`, `option`,
`assignment`, `pitch`, `vote`, `plan`, `rsvp`. Every phone and the big screen subscribe to their lobby's rows
(`useTable(tables.x.where(r => r.lobbyCode.eq(code)))`), so they all stay in sync with no polling and no custom socket server.

Rules are enforced server-side in reducers (17 tests):
- only the lobby's host identity can advance phases or write AI results (`setOptions`, `setReaction`, `setPlan`, …)
- phase order is enforced (you can't pitch during VOTE, can't vote during PITCH)
- **no self-votes:** you can't vote for the option you defended
- **one vote each:** a second vote is rejected
- every player must get an assignment; names are unique per lobby; inputs are validated and length-capped
- ties are broken with SpacetimeDB's deterministic `ctx.random`
- **timed phases run on the server:** starting PITCH (90s) or VOTE (45s) inserts a row into a scheduled
  `phase_timer` table; SpacetimeDB fires the `phaseTimeout` reducer at the deadline and advances the game, even
  if the host's tab is closed. Stale timers (host already moved on) are ignored, and clients can't call it.
- **voting closes itself** the moment the last vote lands
- **test bots:** the host can add bots (`addBot`). They answer the questions and vote inside reducers (never for
  the option they defended); their pitches are written by the AI host and submitted via the host-only `botPitch`

The host browser runs the AI (via our API routes) and writes results back through host-only reducers, so
the database stays the single source of truth that every screen renders from.

### Meta Muse: the AI host
All calls are in `web/lib/ai/muse.ts`:
- **Muse Spark**: chooses 4–6 options from the pre-filtered shortlist, writes each player's defend-prompt,
  reacts to every pitch, pitches any option nobody was assigned, writes the test bots' pitches, and picks the time everyone's free.
- **Muse Voice Transcribe**: voice pitches → text.
- **Muse Image**: a funny movie poster per option.

With no `MUSE_API_KEY`, a **deterministic mock host** runs instead (template reactions, SVG movie posters,
browser speech recognition for transcripts where available), so the whole game works offline. With a key,
every live call has a timeout and **falls back to the mock for that one call** if Muse errors, so the demo can't stall.
The big screen shows which mode is active.

> Status: the live Muse endpoints are stubbed until we have the Muse API docs. The interface and fallbacks are in place.

### Apify: real places
`scripts/fetch-places.ts` runs the `compass/crawler-google-places` actor (Google Maps) around a location
(17 searches: tacos, pizza, vegan, halal, boba, bowling, arcade, museum, …), normalizes the results
(price level, rating, diet tags from "offerings", **parsed opening hours**), and writes
`web/data/places/<slug>.json`. Scraping takes minutes, so it runs **before** the game; the game picks the cached
file nearest the lobby. If there's no cache, it falls back to `sample-palace-of-fine-arts.json`, which is
**hand-written sample data (details approximate)** and is labeled as such on screen.

## Setup

Requirements: Node ≥ 22.18, the [SpacetimeDB CLI](https://spacetimedb.com/install) (`spacetime`, v2.13).

```bash
# 1. Install
cd spacetime && npm install && cd ..
cd web && npm install && cd ..

# 2. Start a local SpacetimeDB on :3000 and publish the module (add --reset to wipe data)
scripts/dev-spacetime.sh

# 3. (only after changing spacetime/src) regenerate client bindings
cd web && npm run generate && cd ..

# 4. Env (optional: everything runs in mock mode without keys)
cp web/.env.example web/.env.local

# 5. Run the web app on :3001
cd web && npm run dev
```

Open **http://localhost:3001/host** on the big screen. Phones join at `http://<your-laptop-LAN-IP>:3001/play/CODE`;
the app automatically talks to SpacetimeDB on `:3000` of the same host.
**Playing alone?** Tap **🤖 Add test bot** in the lobby: one human + bots can play every phase.
To fake extra human phones on one computer, open `/play/CODE?seat=2`, `?seat=3`, … in new tabs (each seat gets its own identity).

**Voice recording on phones needs HTTPS** (browsers block the mic on plain-HTTP LAN addresses). Either deploy
(below), or tunnel both ports (e.g. `cloudflared tunnel --url http://localhost:3001` and one for `:3000`, then set
`NEXT_PUBLIC_SPACETIMEDB_HOST=wss://<spacetime-tunnel>`). Typed pitches work everywhere.

### Refresh real places (Apify)
```bash
APIFY_TOKEN=... node scripts/fetch-places.ts            # Palace of Fine Arts (default)
node scripts/fetch-places.ts --label "Berkeley, CA" --lat 37.8716 --lng -122.2727 --slug berkeley
```

### Deploy
- **SpacetimeDB → Maincloud:** `spacetime login` then
  `spacetime publish pitch-fight --module-path spacetime --server maincloud`.
- **Web → Vercel** (root directory `web`): set `NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com`,
  `NEXT_PUBLIC_SPACETIMEDB_DB_NAME=<your db name>`, and the Muse vars.

### Tests
```bash
cd spacetime && npm test   # reducer rules against SpacetimeDB's in-memory test datastore
cd web && npm test         # hours parser, hard filters + relaxation, time slots, assignments, .ics, mock AI

# Full game in real browsers (needs the app + SpacetimeDB running, and `npm i -g playwright`)
node scripts/e2e.cjs          # big screen + 2 phones, every phase
node scripts/e2e.cjs --solo   # big screen + 1 phone + 2 test bots
```

## Environment variables (`web/.env.local`)

| Var | Needed for | Notes |
|---|---|---|
| `MUSE_API_KEY` | live AI host | empty → mock host |
| `MUSE_API_BASE_URL`, `MUSE_TEXT_MODEL`, `MUSE_TRANSCRIBE_MODEL`, `MUSE_IMAGE_MODEL` | live AI host | from the Muse docs |
| `APIFY_TOKEN` | `scripts/fetch-places.ts` | not used at game time |
| `NEXT_PUBLIC_SPACETIMEDB_HOST` | non-local SpacetimeDB | default `ws(s)://<page host>:3000` |
| `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` | | default `pitch-fight` |

## Demo script (≈3 min)

0. **Only one judge?** Add two test bots in the lobby; everything below still works.
1. **Hook (15s):** "Every group chat has the same fight: *where do we go?* Pitch Fight turns that fight into a game."
2. **Lobby (20s):** open `/host` on the projector → **Start game**. Room code + QR appear; the AI host welcomes everyone out loud.
   Two judges scan the QR and type names; their avatars pop in live (SpacetimeDB subscriptions).
3. **Questions (30s):** **Everybody's in → Start**. Phones show five tap questions. On the review screen, hide one answer:
   "Your diet still filters the options, but the big screen never shows it."
4. **Options (30s):** **Find our spots.** Real nearby places that pass every hard filter, each with a movie poster.
   Phones reveal assignments: *"Defend Tacolicious like a lawyer giving closing arguments."*
5. **Pitch (30s):** one judge records a voice pitch, the other types one ("loud room mode").
6. **Showtime (30s):** **Showtime** → each contender on the big screen: pitch text, the AI host's roast, read aloud with captions.
   Point out the option nobody defended: the AI host pitches it itself.
7. **Vote + plan (30s):** phones vote (your own option is greyed out, and the server rejects it anyway). Votes close
   automatically → winner reveal → **Make it the plan**: the time everyone's free, `.ics` download, RSVP buttons.
8. **Close (15s):** "SpacetimeDB is the game board and enforces the rules, Muse is the host, Apify makes the places real."

Backup: if the network dies, the mock AI host + cached places keep the full loop running.

## Known limitations
- Live Muse calls are stubbed until the API docs are in; the game runs on the mock host (clearly labeled on screen).
- Profiles live in a public SpacetimeDB table; "hidden" answers are hidden in the UI, not cryptographically private.
- The AI calls (options, posters, reactions, bot pitches) run from the host's browser tab. If the host closes it, the
  pitch and vote timers still advance the game on the server, but AI steps wait until the host screen is reopened.
- Opening hours are evaluated in the venue's local time using the host browser's clock; places with unknown hours are allowed but ranked lower.
- Diet tags come from Google "offerings", which are incomplete; diet is never relaxed unless nothing else is left, and the screen says so when it is.
- Sample places data is hand-written and approximate; run the Apify script for real data.
- Countdowns are rendered against each device's clock, so a phone with a skewed clock shows a slightly off timer (the server deadline is what counts).
- Phones joining by new tab/device get a new identity (tokens are per browser), so rejoining from another device creates a new player.
- Not built yet: strangers mode (QR → match queue → auto lobby), Instagram Story share card.

## Repo layout
```
spacetime/          SpacetimeDB module (TypeScript) + vitest tests
web/                Next.js 16 app (App Router)
  app/api/          AI + places routes (server-only keys)
  components/
    host/           big screen (lobby, showtime, results, AI host voice)
    play/           phone controller (join, questions, pitch, vote)
    shared/         ui.tsx primitives + PlanCard
  lib/ai/muse.ts    every Muse call + mock host
  lib/game/         questions, hard filters, time slots, assignments, .ics
  lib/places/       Apify normalization + cache loader
  data/places/      cached places JSON (sample + Apify output)
  src/module_bindings/  generated SpacetimeDB client bindings
scripts/            fetch-places.ts (Apify), dev-spacetime.sh, e2e.cjs (browser smoke test)
docs/               REDESIGN.md (UI redesign notes)
```

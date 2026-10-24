Build prompt: "Hear Me Out" — the party game that turns "idk, where do you want to go?" into an actual plan

Paste this whole file into your coding agent as the first message (or save it as SPEC.md at the repo root and tell the agent to follow it). "Hear Me Out" is a working name; rename freely.

## 0. Your role and how to work

You are a senior full-stack engineer building a hackathon project end to end, in one session, with minimal check-ins. Work autonomously. Make reasonable decisions, write them down in DECISIONS.md, and keep going.

Rules for this build:

- Read current docs before writing integration code. SpacetimeDB 2.x, the Meta Model API (Muse), and Apify actors all changed in 2026 and your training data is likely stale. Fetch and skim: SpacetimeDB TypeScript module docs (tables, reducers, procedures, views, schedule tables, event tables), the SpacetimeDB React client docs, the Meta Model API docs at https://dev.meta.ai/docs (chat, images, voice), and each Apify actor's input schema page. Where this spec and the docs disagree on syntax, the docs win.
- Build in milestones (section 9). After each milestone the app must run. Commit after each one.
- Never let the demo die. Every external call (Muse, Apify, voice) goes behind an interface with a timeout, a retry, and a fixture fallback. DEMO_MODE=1 must make the full game playable offline from fixtures.
- No fake integrations presented as real. If something is a stand-in (see "Bring your Muse" in 4.2), label it honestly in the UI and README.
- Prefer boring, well-typed code. TypeScript everywhere. pnpm workspaces.
- **Platform: desktop browsers on macOS only.** The TV and every player run as browser windows on a Mac (Chrome primary, Safari smoke test). No mobile support or testing. "Phone" in this spec means a player window at `/play/:code`. Several players can share one Mac, so each tab must get its own SpacetimeDB identity (store the auth token in `sessionStorage`, not `localStorage`).
- **Scope cut line:** the demo is the Friends path (M1–M4 + M7 polish). M5 keeps manual chips + paste-from-Muse in the core; the vibe-profiler actor is a self-contained package that can be built in parallel. M6 is a thin version that works with bots. Skip the stretch goals unless everything else is done.
- **No `META_API_KEY` yet:** every Muse call must run on fixtures when the key is blank, regardless of `DEMO_MODE`.

## 1. The product (one paragraph)

A Jackbox-style multiplayer game for deciding what to do together. Everyone joins from their own browser window; a shared "TV" screen runs the show. The AI finds real nearby options that fit the whole group (budget, diet, distance, open hours), then assigns each player an option to defend, often not their own favorite, with a funny personalized prompt ("Defend the taco place like a lawyer in court"). Players record 30-second voice pitches, the AI fact-checks wild claims live ("OBJECTION: Pho Real closes at 9"), everyone votes, and the winner becomes the real plan: a time that works for everyone, a generated invite poster, and a calendar invite on every phone. Two modes: Friends (private room) and Strangers (open nearby lobbies that become small public meetups, with the option to merge tables when two groups pick the same place).

### Why it wins each judging criterion (keep these front of mind while building)

- **Human Connection (30%):** defending a friend's pick forces you to see it through their eyes; the "Why this works for everyone" card names each person; strangers mode turns a game into a real-world meetup with AI icebreakers; "Most Persuasive" award celebrates people, not the AI.
- **AI Integration (25%):** AI is in every phase and the game cannot exist without it: profile distillation, real-option curation, constraint satisfaction, assignment + personalized prompts, transcription, live fact-checking, commentary, tie-breaks, invite copy and poster art, stranger matching.
- **Originality (20%):** debate-as-decision, assigned-to-defend-the-other-side, AI objections grounded in real venue data, table merging.
- **Technical Execution (20%):** real-time shared state on SpacetimeDB, real data from Apify, Meta Muse models end to end, many live player windows in sync.

### Sponsor tracks this must clearly satisfy

- **Meta track:** Muse Spark (reasoning, structured outputs), Muse Voice Transcribe (pitches), Muse Image (invite poster).
- **SpacetimeDB track:** SpacetimeDB is the backend: all game state, phases, timers, votes, reactions, matchmaking, and merge offers live in tables and reducers. The AI orchestrator is itself a SpacetimeDB client ("an AI agent coordinating in a persistent world state"). Not a side add-on.
- **Apify track:** Google Maps Scraper for real venues; Instagram / TikTok / Facebook post scrapers for opt-in vibe profiles; plus a custom published actor (vibe-profiler) for the best-actor award.

## 2. Architecture

Division of responsibility (important for the Spacetime judges):

- **Deterministic logic lives in reducers:** room lifecycle, phase transitions (driven by schedule tables, server-authoritative timers), joining/leaving, vote tallying, tie handling, availability intersection and time-slot selection, lobby matching scores (tag overlap), merge offers and merge votes, RSVPs, authorization.
- **Fuzzy/creative/external work lives in the orchestrator**, triggered by reducers inserting rows into `ai_job`. The orchestrator claims the job, does the work, and calls `complete_job` / `fail_job`. Every phone sees results appear live through subscriptions.
- **Optional stretch:** move one short Muse call (the live "hype commentator" line) into a SpacetimeDB procedure using `ctx.http.fetch` to showcase procedures. Procedures can do outbound HTTP (default 30s timeout, max 180s) but can't hold a transaction open during the request, so use `ctx.withTx` only after the fetch returns.
- **Auth for the orchestrator:** in the module's `init` lifecycle reducer, store `ctx.sender` (the publisher) in a private `config` table as `admin_identity`. The orchestrator connects with the publisher's token (`SPACETIMEDB_TOKEN`). Every worker-only reducer checks `ctx.sender == admin_identity` and throws otherwise. Verify this pattern against current docs.
- **Privacy enforced at the database layer:** raw scraped social data and unapproved profile drafts go in private tables. Expose them only through views scoped to `ctx.sender` (the player sees their own draft) and to the admin identity (the orchestrator). Other players only ever see the player's approved tags. Raw scraped posts are deleted after tags are derived.
- **Media lives in SpacetimeDB:** the orchestrator has no inbound HTTP at all; it only makes outbound connections (to SpacetimeDB, Muse, Apify), so it can run on any Mac with no public URL, tunnel, or hosting.
  - Pitch audio: the browser records at ~32 kbps Opus (≈120 KB per 30s clip) and sends the bytes to the `upload_pitch_audio` reducer, which stores them in the `media` table. The orchestrator reads them from its subscription, converts with ffmpeg, and transcribes.
  - Posters: use the image URL Muse Image returns if it returns one; if it only returns base64, the orchestrator downscales to a JPEG (target ≤200 KB) and writes it to `media` via a worker-only reducer.
  - `.ics` files are generated in the browser from the `plan` row and downloaded as a Blob.
  - Only the TV subscribes to `media` rows for its room; player windows do not, so they never download everyone's audio. A scheduled reducer deletes a room's `media` rows when the room ends (or after 2 hours).
  - **Verify first (M1):** SpacetimeDB does not document a maximum message size. Test a 200 KB byte-array reducer argument against the local server and against Maincloud before building on this. If it fails, fall back to orchestrator-hosted media on Railway (`POST /upload`, `GET /media/:id`) and add `PUBLIC_ORCHESTRATOR_URL` back.
- **Redundant orchestrators are safe:** `claim_job` is an atomic reducer, so two orchestrator instances (e.g. your Mac and a backup) never take the same job.
- **Schema stability:** `spacetime publish` refuses breaking schema changes. Define the full section 7 schema in M1, even tables later milestones use, so later work adds tables instead of altering them. Iterate locally; publish to Maincloud late and rarely.
- **Deploy target (multi-Mac):** SpacetimeDB Maincloud (`spacetime publish --server maincloud <db>`) is the one shared world state. Web on Vercel, so every Mac opens the same HTTPS URL with no setup; running the web app on `localhost` on each Mac (pointed at Maincloud) is the fallback. Exactly one orchestrator holds the Muse and Apify keys and runs on the host Mac (Railway is optional, as a backup). Browsers never hold keys. During development, iterate against the local server (`--server local`) and publish to Maincloud only for multi-Mac tests and the demo. The microphone needs a secure context: `localhost` and the Vercel HTTPS URL both work; plain LAN http does not.

## 3. Meta Model API (Muse) — integration notes

Verify everything here against https://dev.meta.ai/docs before coding.

- Base URL `https://api.meta.ai/v1`, Bearer auth with `META_API_KEY`. OpenAI-compatible, so use the official `openai` npm SDK with `baseURL` set.
- **Muse Spark (text/reasoning):** model from env `MUSE_MODEL`, default `muse-spark-1.3` (check `/v1/models` for the newest). Supports function calling, structured outputs, prompt caching, and `reasoning_effort` (minimal…xhigh). Use low/minimal inside the game loop for speed; medium for curation. Meta recommends putting tone/format/standing rules in a developer message rather than system.
- Always request JSON via structured outputs (JSON schema), validate with zod, and retry once with the validation error appended. Fall back to fixtures on second failure.
- Built-in web search grounding exists; use it only for movie mode (showtimes tonight), behind a flag, after confirming the request parameter in the docs.
- **Muse Image:** model `muse-image-1.0`, `POST /v1/images/generations` (OpenAI `images.generate`). `size` like `"1024x1536"` sets aspect ratio only. ~$0.01/image. Use for the final invite poster (and optionally a courtroom-sketch card per finalist option).
- **Muse Voice Transcribe:** model `muse-voice-transcribe-1.0`.
  - Primary path: file endpoint `POST https://api.meta.ai/v1/asr/transcribe` for the recorded 30s pitch. Confirm the multipart field names and accepted formats in the docs. Browsers record `audio/webm` (Chrome) or `audio/mp4` (Safari), so the orchestrator always converts to 16 kHz mono WAV with `ffmpeg-static` before sending.
  - Stretch path: realtime `wss://api.meta.ai/v1/asr/realtime` (Bearer in the handshake, mono PCM16 at 16k or 24k) for live captions that stream onto the TV while the player is still talking. Browsers must not hold the key, so relay through the orchestrator over a WebSocket and write partial transcripts into the `pitch.live_caption` column so every screen updates live. This stretch is the one feature that needs a publicly reachable orchestrator (Railway), since the orchestrator otherwise accepts no inbound connections.
  - Wrap behind `transcribe(buffer): Promise<string>`. If transcription fails, the phone offers "type your pitch instead" so the round never stalls.
- **Budget:** participants have $50 of Meta credits. Cap Muse calls per room, cache aggressively, and log token usage to the console.

## 4. Data sources

### 4.1 Apify — real venues

Actor `compass/crawler-google-places` via `apify-client`. Key inputs: `searchStringsArray`, `locationQuery`, `maxCrawledPlacesPerSearch` (keep ~20), `language: "en"`, `skipClosedPlaces: true`, `maxImages: 1`, `maxReviews` small (0–5; reviews help the AI detect dietary options and vibe). Check the actor's input schema page for geolocation options so you can search around the room's lat/lng.

Category handling:

- **Food:** search strings derived by Muse from the group's tags (e.g. "ramen", "vegan-friendly tacos").
- **Activity:** Muse picks 3–4 queries from group tags ("board game cafe", "karaoke", "bowling", "escape room").
- **Movie:** theaters via Maps + showtimes via Muse web grounding, or for online lobbies, streaming/game picks straight from Muse. Movie mode is lowest priority.

Latency: Apify runs take 30s to a few minutes, longer than the warm-up alone can hide. Start the run asynchronously as soon as the host sets category + location in the lobby (section 5, phase 1), so it runs during profiles and the warm-up. Tag-specific queries can follow as a second run if time allows. Cache results in a `venue_cache` table keyed by (area geohash, category, query) for 6 hours, and pre-warm the cache for the demo location before presenting (it is still real Apify data). On first successful run, save the raw dataset to `fixtures/venues-<area>.json`.

Normalize to a `Venue` type (title, category, address, lat/lng, price level, rating, review count, opening hours, maps URL, image URL, review snippets) and verify field names against a real run before trusting them. Parse opening-hours strings in the orchestrator during normalization into today's open intervals as minutes-of-day in the room's timezone, so reducers only compare integers. Travel time is an estimate (straight-line distance from the room's location plus a speed heuristic); label it as approximate in the UI.

### 4.2 "Bring your Muse" — player context (consent-first)

The vision: each player's Muse brings what they've chosen to share. There is no public API for a user's personal Meta AI memory or messages, so build an honest stand-in:

1. **Manual basics** (fast chips, under 20 seconds): budget (–$$$), dietary needs, max travel time, availability tonight (time-window chips), vibe chips.
2. **Paste from your Muse** (optional): a text box with a copyable suggested prompt the player can run in their own Meta AI app ("Summarize my food likes, budget, and free time this week in 5 bullets"). The player pastes the answer.
3. **Link your own public social** (optional): the player enters their own Instagram/TikTok/Facebook handle and ticks "this is my account and I consent". The orchestrator runs the custom `vibe-profiler` actor on it.
4. Muse Spark distills all of the above into draft tags (e.g. spicy-food, board-games, night-owl, cheap-eats, anime), each with a one-line "because…" source.
5. The player approves, edits, or deletes every tag before anyone else can see anything. UI badge: "Only what you approve is shared. Private messages are never read."
6. Raw scraped posts are deleted once tags are derived.

### 4.3 Custom Apify actor: vibe-profiler (for the best-actor award)

A reusable, publishable actor: "Turn public social posts into interest & taste tags."

- **Input schema:** `instagramHandles[]`, `tiktokHandles[]`, `facebookPageUrls[]`, `postsPerProfile` (default 12), optional `museApiKey` + `museModel`.
- **Implementation:** `Actor.call` in parallel to `apify/instagram-scraper` (posts), `clockworks/tiktok-scraper` (profile videos), `apify/facebook-posts-scraper`. Verify each actor's input fields on its Store page. Normalize every post to `{platform, handle, text, hashtags, locationName, timestamp, mediaType}`.
- **Deterministic enrichment:** top hashtags, top tagged locations, keyword-to-interest heuristics (food, nightlife, outdoors, gaming, film, music, fitness, arts), posting-time pattern (morning person / night owl).
- If `museApiKey` is provided: Muse Spark returns `vibeTags[]` with evidence post indices.
- **Output:** one dataset item per handle + an `OUTPUT` record in the key-value store with the merged profile.
- Ship `.actor/actor.json`, `.actor/input_schema.json`, Dockerfile, a Store-quality README with example input/output, and a `pnpm actor:push` script (`apify push`). Keep compute cheap.

## 5. Game flow (Friends mode — the P0 path)

TV screen = `/host/:code`, phones = `/play/:code`. Every phase has a server-side deadline from a schedule table; the TV shows a countdown ring; the host can skip ahead.

1. **Lobby + setup:** host creates a room → 4-letter code + join link. Players join with a name + emoji avatar. Host can add bot players (for testing and solo demos). In the lobby the host also picks category (Food / Activity / Movie) and location (browser geolocation or typed neighborhood); setting them inserts `ai_job(kind='scout')` right away so Apify starts early.
2. **Profiles (≤60s):** "Bring your Muse" flow in each player window (4.2). TV shows avatars flipping to "ready" as approved tags appear around them.
3. *(merged into phase 1)*
4. **Scouting + warm-up:** the scout job is already running. While Apify finishes, players play a 45-second warm-up: Muse generates one personalized "hot take" question per player from their approved tags ("Pineapple on pizza: defend or destroy?"); answers pop up on the TV. This turns API latency into fun.
5. **Finalists:** Muse curates N finalists (N = min(players, 4), min 2) from the venues. Hard filters first in code (open during a feasible time slot, within everyone's max travel, within budget ceiling, meets all dietary needs), then Muse ranks and writes per-person fit lines ("Sam: has vegan ramen; Priya: $$, 12 min walk"). TV reveals finalists like contestants. If the hard filters leave fewer than 2 venues, relax in this order: travel, then budget, then hours, and show what was stretched on the TV ("We stretched the budget for this one"). Dietary needs are never relaxed.
6. **Private pre-vote:** each phone secretly picks a favorite (10s). Used later for the "Most Persuasive" award.
7. **Assignments:** Muse assigns each player an option to defend, preferring an option that is not their pre-vote pick. If players > options, assign co-counsel pairs. Each assignment gets a personalized style prompt using the player's tags and the option's details, e.g. "Defend Pho Real like a nature-documentary narrator who just discovered broth." Show on that player's phone with 3 hint bullets drawn from real venue data.
8. **Pitches (30s each, players record in parallel, playback is sequential on the TV):**
   - Player window: click to start, click to stop, auto-stop at 30s, with a 30s ring; re-record allowed once.
   - The TV needs one user click before it can play audio; the host's Start button unlocks it.
   - Pipeline the fact-check: run it while the previous pitch plays, so each ruling is ready the moment its pitch ends. Playback of 4 pitches already takes 2 minutes, so the host skip button matters.
   - Upload → `upload_pitch_audio` reducer → `media` row → `ai_job(kind='transcribe')` → orchestrator → ffmpeg → Muse transcribe → `pitch.transcript`.
   - TV plays each pitch with big captions and the player's avatar bouncing to the audio level. Other phones can spam reactions (😂 🔥 🧑‍⚖️ 🍜) and one "OBJECTION!" button per pitch. Reactions fly across the TV in real time (use an event table if available, otherwise a short-TTL table cleaned by a scheduled reducer).
   - **AI fact-check:** after each transcript, Muse compares claims against the venue record (hours, price, rating, distance, dietary) and returns at most one ruling: "OBJECTION SUSTAINED: it closes at 9pm, not midnight" or "Claim verified: 4.7 stars from 1,200 reviews." Slam it on the TV with a gavel sound. Keep it playful, never mean.
9. **Final vote:** one vote per player; any option allowed.
10. **Results:**
    - Winner reveal with confetti. Tie → "The Judge breaks the tie": the option with the higher group-fit score, with a one-line reason.
    - **Most Persuasive:** the advocate whose option gained the most votes between pre-vote and final vote.
    - **Best line:** Muse picks the funniest quote from all transcripts.
11. **The Plan:**
    - Reducer intersects everyone's availability with the venue's opening hours and picks the earliest slot everyone can make; if none, the slot that maximizes attendance and shows who can't make it.
    - Muse writes the invite copy + a "Why this works for everyone" list naming each person.
    - Muse Image generates a poster (vertical, festive, venue name + time).
    - Each player window shows: poster, time, Maps link, Add to calendar (.ics generated in the browser + Google Calendar link), RSVP buttons, and a share link. TV shows live RSVPs.

## 6. Strangers mode (P1)

Lobby browser on `/`: open lobbies near you (or "Online" for movies/games), each card showing category, start time, player count, and shared vibe tags. Sorted by a vibe match score computed in a reducer (weighted tag overlap + distance), with a Muse one-liner on the top matches ("You'd vibe: 3 of them are also into board games and spicy food").

Same game loop, with safety rules built into the flow:

- 18+ confirmation, first names only, public venues only, neighborhood-level location until you RSVP, block and report on every player card, minimum 3 RSVPs for a meetup to be confirmed.
- The winning plan becomes a meetup card: "6 people · board-game café · 8pm" with opt-in RSVP and 3 AI icebreakers generated from shared approved tags.
- **Merge tables:** when two rooms (friends or strangers) confirm the same venue with overlapping time slots, a reducer creates a `merge_offer`. Both rooms see "The Taco Lawyers picked the same place at 8pm. Merge tables?" Merging requires a majority yes in both rooms, then both plans and RSVP lists combine, and a Muse-written intro joins the two groups.

## 7. SpacetimeDB data model

Adapt names to the 2.x TypeScript syntax. Public tables unless marked private.

- `config` (private): admin_identity.
- `room`: id, code (unique), mode (friends|strangers), category, host_identity, phase, phase_deadline, location_label, lat, lng, is_public, vibe_tags, created_at.
- `player`: id, identity (indexed), room_id (indexed), name, avatar, is_bot, connected, ready, joined_at.
- `profile_public`: player_id, approved_tags, budget_max, dietary, max_travel_min, availability_windows.
- `profile_draft` (private, exposed through a sender-scoped view): player_id, draft_tags_with_reasons, pasted_context, social_links, status.
- `venue_cache` (private): key, category, fetched_at, items_json.
- `media`: id, room_id, kind (pitch_audio|poster), mime, bytes (byte array), created_at. Subscribed to by the TV only; cleaned up by a scheduled reducer.
- `option`: id, room_id, venue fields, fit_summary, per_player_fit_json, group_fit_score, poster_url (Muse-hosted URL, or empty when `poster_media_id` is set), poster_media_id.
- `assignment`: player_id, option_id, style_prompt, hints_json.
- `pitch`: id, room_id, player_id, option_id, audio_media_id, live_caption, transcript, status, duration_ms, ruling_text, ruling_kind.
- `reaction`: room_id, pitch_id, player_id, emoji, created_at (event table or short TTL).
- `prevote` and `vote`: room_id, player_id (unique per room), option_id.
- `award`: room_id, kind (most_persuasive|best_line), player_id, text.
- `plan`: id, room_id, option_id, start, end, invite_text, why_json, poster_url, poster_media_id. (No `ics_url`: the browser builds the .ics from this row.)
- `rsvp`: plan_id, player_id, status.
- `merge_offer` and `merge_vote`.
- `ai_job`: id, room_id, kind (distill_profile|warmup|scout|curate|assign|transcribe|factcheck|awards|plan_copy|poster|icebreakers|match_blurb|bot_pitch), status (queued|running|done|failed), payload_json, result_json, error, attempts, created_at. Exposed to the admin identity only (view), with a public `room.ai_status` string so the TV can show "The Judge is reviewing the evidence…".
- `phase_timer`: schedule table → `advance_phase` reducer.

Key reducers: `create_room`, `join_room`, `leave_room`, `set_profile_basics`, `submit_pasted_context`, `link_social`, `approve_tags`, `set_room_setup`, `start_game`, `submit_warmup_answer`, `cast_prevote`, `upload_pitch_audio`, `react`, `object`, `cast_vote`, `advance_phase` (scheduled + host skip), `rsvp`, `propose_merge` (internal), `vote_merge`, `add_bot`, worker-only `claim_job` / `complete_job` / `fail_job` / `write_live_caption` / `write_media`, plus `clientConnected` / `clientDisconnected` lifecycle handlers that update `player.connected`.

## 8. Muse prompts

Write each as a developer message + JSON schema; keep them in `apps/orchestrator/src/prompts/`.

Tone for everything: a witty, warm game-show judge. Playful, inclusive, never mocks a person, never makes things up about venues (only use provided data; say "unknown" otherwise).

- **distill_profile:** input = basics + pasted context + vibe-profiler output → output `tags[]` (≤8, kebab-case) each with reason and source. Never infer sensitive traits (health, religion, sexuality, politics, ethnicity); diet is only what the player stated.
- **warmup:** per player, one silly either/or question grounded in their tags.
- **scout_queries:** group tags + category → 2–4 Maps search strings.
- **curate:** filtered venues + approved profiles → N finalists with `per_player_fit` lines and `group_fit_score` 0–100. Prefer variety (different cuisines/vibes).
- **assign:** pre-votes + finalists + player tags → assignments that avoid each player's own pick where possible, with `style_prompt` (a persona + a twist, ≤18 words) and 3 factual hints.
- **factcheck:** transcript + venue record → `{kind: "sustained"|"verified"|"none", text ≤20 words}`.
- **awards:** all transcripts → best line (quote ≤15 words, attributed).
- **plan_copy:** winner + slot + players → invite text (≤40 words), `why_for_each[]` naming each person, and an image prompt for the poster.
- **icebreakers / match_blurb:** shared approved tags → 3 icebreakers / one-line match reason.
- **bot_pitch:** for bot players, a 60–80 word text pitch in the assigned style (shown as captions, no audio).

## 9. Milestones

Build in this order; app must run after each.

- **M1 — Skeleton:** pnpm workspace, `spacetime dev` with the TypeScript module + React client, room create/join with codes, TV and phone routes, live player list, phase machine with scheduled timers, bot players. `scripts/sim.ts` drives a room from lobby to results with bots. Includes the 200 KB byte-array reducer test from section 2 (local first, Maincloud before M3).
- **M2 — Game loop on fixtures:** all phases end to end with `DEMO_MODE=1` (fixture venues, fixture Muse outputs, typed pitches), votes, awards, availability intersection, plan + .ics. `sim.ts` passes.
- **M3 — Real Muse:** orchestrator job runner, all prompts with zod validation and fallbacks, Muse transcription of recorded pitches (ffmpeg conversion), fact-check objections, Muse Image poster.
- **M4 — Real Apify venues:** Google Maps scraper with async run, caching, warm-up round covering the latency, fixture recording.
- **M5 — Bring your Muse + vibe-profiler actor:** consent flow, tag approval UI, private tables/views, custom actor built, tested, and pushed to Apify.
- **M6 — Strangers mode:** lobby browser, vibe matching, safety rules, meetup card, merge tables.
- **M7 — Polish:** Jackbox-level juice (big type, bold colors, Framer Motion transitions, reaction particles, gavel/confetti sounds with a mute toggle, captions always on), Chrome + Safari on macOS check, loading states with funny copy, error toasts, README, demo script.
- **Stretch:** realtime live captions over Muse Voice realtime; one Muse call as a SpacetimeDB procedure; Apify webhook delivered straight to a SpacetimeDB HTTP handler; movie mode with showtimes.

## 10. Acceptance criteria

Check each before calling it done.

- [ ] 1 TV window + 4 player windows on macOS (Chrome, plus a Safari smoke test) complete a Friends round in under 6 minutes, on localhost and on the deployed HTTPS URL.
- [ ] Finalists are real nearby venues from Apify that respect every player's budget, diet, travel, and an open time slot; each finalist shows per-person fit lines.
- [ ] At least one player is assigned an option that wasn't their pre-vote pick, with a personalized style prompt.
- [ ] Voice pitches transcribe via Muse; captions show on the TV; at least one AI objection or verification appears per round when a factual claim is made.
- [ ] Votes tally in real time; ties resolve; Most Persuasive and Best Line awards appear.
- [ ] Plan shows a time everyone can make (or who can't), a Muse Image poster, working .ics + Google Calendar link, live RSVPs.
- [ ] No player sees another player's unapproved data; raw scraped posts are deleted after distillation; the consent copy is visible.
- [ ] Strangers lobby list, vibe match, meetup card, and a two-room merge work with bots.
- [ ] vibe-profiler runs on Apify with a real handle and is pushed with a Store README.
- [ ] With `DEMO_MODE=1` (or with Muse/Apify unreachable or keys blank), the whole game runs on fixtures. SpacetimeDB itself still needs to be reachable; the backup screen recording covers a full network outage.
- [ ] `pnpm sim` passes; `pnpm typecheck` passes.

## 11. Deliverables

Working app deployed (Maincloud + Vercel, orchestrator running on the host Mac) with `.env.example`: `META_API_KEY`, `MUSE_MODEL=muse-spark-1.3`, `MUSE_IMAGE_MODEL=muse-image-1.0`, `APIFY_TOKEN`, `SPACETIMEDB_URI`, `SPACETIMEDB_DB_NAME`, `SPACETIMEDB_TOKEN`, `DEMO_MODE`, `DEMO_LOCATION`.

**README.md:** one-line pitch, screenshots/GIF, architecture diagram (Mermaid), setup in under 10 commands, and a "How we use each sponsor" section (Meta / SpacetimeDB / Apify) mapping features to tables, reducers, models, and actors.

**DEMO.md:** a 3-minute demo script:

- 0:00 The "idk, where do you want to go?" group chat problem.
- 0:20 4 player windows join with the room code, one player links their Instagram and approves tags.
- 0:45 AI scouts real venues while players answer warm-up hot takes.
- 1:10 Assignments revealed ("Maya, defend the ramen place like a nature-documentary narrator").
- 1:30 Two pitches with captions, reactions, and an AI objection.
- 2:10 Vote, Most Persuasive award, winner, time, poster, invites landing on phones.
- 2:35 Strangers lobby + "merge tables?" moment.
- 2:50 Architecture slide: SpacetimeDB as the live world state, Apify for real-world data, Muse in every phase.

A backup screen recording of a full round, in case venue Wi-Fi fails.

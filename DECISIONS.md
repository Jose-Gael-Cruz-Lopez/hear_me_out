# Decisions

Running log of choices made while building, newest last. SPEC.md is the plan; this file records where the build deviates or fills gaps.

## Platform and hosting

1. **Desktop browsers on macOS only** (agreed with the team). Every player is a browser window; several can share one Mac. Each tab gets its own SpacetimeDB identity by keeping the auth token in `sessionStorage`.
2. **Media lives in SpacetimeDB** (`media` table, `t.array(t.u8())`). Tested locally: 200 KB, 600 KB and 1.5 MB reducer arguments all succeed and arrive client-side as `Uint8Array`. The orchestrator therefore needs no inbound HTTP and no public URL. `PUBLIC_ORCHESTRATOR_URL` was removed. Maincloud size test still to run before M3.
3. **`spacetime.json` defaults to the local server.** Maincloud publishing only happens through `pnpm db:maincloud`.
4. **pnpm 12** needs dependency build scripts allow-listed under `allowBuilds` in `pnpm-workspace.yaml` (esbuild, ffmpeg-static).

## Module (SpacetimeDB)

5. **Setup moved into the lobby.** Picking category + location queues the `scout` job immediately, so Apify runs during profiles and the warm-up.
6. **Typed result reducers per job kind** (`finish_scout`, `finish_curate`, …) instead of one `complete_job(result_json)`. Results are type-checked end to end through generated bindings; `ai_job.result_json` still stores a short summary for debugging. `claim_job` / `fail_job` are as specced.
7. **Every AI job has a deterministic fallback inside the module** (`cleanup.ts: applyFallback`), applied by `fail_job` or by the janitor when a job is stuck (>90 s running, retried up to 3 times) or never claimed (>10 min). Waiting phases (`scouting`, `assigning`) also have safety deadlines. A round can never stall on the AI.
8. **Assignment mapping is deterministic, in a reducer** (`logic/assign.ts`): every option gets an advocate, players avoid their own secret pick where possible, extras become co-counsel. Muse only writes the style prompts and hints. Default briefs are written immediately so the phase works even if the `assign` job fails.
9. **Private tables + views:** `prevote` → `my_prevote`, `profile_draft` → `my_profile_draft` (sender-scoped), `ai_job` → `admin_jobs`, `venue_cache` → `admin_venue_cache` (admin identity only). The sim checks players can't see drafts or the job queue.
10. **Admin identity** is stored by `init` from `ctx.sender` (verified: equals the CLI login identity). The orchestrator confirms it on startup with the `who_am_i` reducer.
11. **Bots belong to the module identity** (`ctx.identity`), never the host's, so the host's identity never maps to a player row.
12. **Scheduled reducers reject direct calls** (`ctx.sender` must equal `ctx.identity`). Phase timers carry `phaseSeq`; stale timers are ignored.
13. **Renamed reducers:** `rsvp` → `set_rsvp` (clashed with the `rsvp` table's generated type), `object` → `raise_objection`.
14. **`fastMode` rooms** shorten every deadline for the simulator.
15. **Players are marked done per phase** with `player.acted_seq = room.phase_seq`, so screens can show who has voted/answered without extra tables, and phases end early once everyone has acted.
16. Added tables the spec implied but didn't list: `warmup` (question + answer per player), `objection` (one per player per pitch), `janitor_timer`.

## Data and AI

17. **Fixtures are real recorded Apify data**, not invented venues: `compass/crawler-google-places` around the Palace of Fine Arts (the DEMO_LOCATION), recorded 2026-10-24 (50 food + 60 activity places). Raw dumps stay in `fixtures/raw/` (gitignored, they contain review text); the normalized file `fixtures/venues-palace-of-fine-arts.json` is committed.
18. **Price ranges** (Google now shows `$20–30` style ranges) map to $–$$$$ by the range midpoint.
19. **Travel time is an estimate** from straight-line distance: walking under 1.6 km, otherwise a city ride. Labeled "~N min" in the UI.
20. **Relaxation order** when hard filters leave too few venues: travel, then budget, then hours. Diet is never relaxed; a venue without diet evidence appears only as a last resort with an explicit "Couldn't confirm vegan options. Check the menu." note.
21. **`group_fit_score`** is a deterministic score (rating, popularity, budget, travel, diet evidence, tag overlap), blended 50/50 with Muse's score when Muse curates, so tie-breaks stay grounded in data.
22. **Offline fact-checker** (`services/factcheck.ts`) parses claims about hours, stars, price, distance, diet and review counts and checks them against the venue record. Used in DEMO_MODE and when Muse finds nothing to rule on.
23. **Bot pitches in fallback mode exaggerate one fact on purpose** so the fact-checker has something to object to.
24. **Muse calls** use the OpenAI SDK against `https://api.meta.ai/v1`, rules in a `developer` message, `response_format: json_schema` (strict false), zod validation with one retry carrying the validation error, `reasoning_effort` minimal/low in the game loop and medium for curation, a per-room cap of 80 calls, and token logging. The key is read from `META_API_KEY` or `MODEL_API_KEY` (the name Meta's docs use). With no key, every Muse call falls back to offline content.
25. **Transcription** follows Meta's docs: ffmpeg to 24 kHz mono 16-bit WAV, multipart `request` (JSON) + `audio` parts to `/v1/asr/transcribe`. If Muse is unavailable, the browser's own speech-recognition transcript (captured while recording, labeled "captions by your browser") is used; failing that the player types the pitch.
26. **Poster**: Muse Image returns base64 by default; we request JPEG and store it in `media`. Without Muse, the client renders a typographic poster from the plan, labeled as such.
27. **Raw scraped social posts never touch the database.** They will be held in orchestrator memory only while tags are derived (M5).
28. **Geocoding** of typed neighborhoods uses OpenStreetMap Nominatim (free, no key), with the fixture area as the fallback.

# STATUS

What everyone (people and agents) is doing on Hear Me Out. **Every push must update this file**; the `pre-push` hook checks. How: `CLAUDE.md` → Workflow.

## In progress

<!-- One line each: what · who (agent) · branch -->
- Iterating on the combined build (main + Jose's latest design commits) · Anish (Claude Code) · `fix-names-whatsapp-muse` (same as `deploy-combined` up to `cc94a6a`)

## Up next / on hold

- Muse labels: Anish decided Muse shows as connected with no demo labels (DECISIONS #40); `deploy-combined` now does that. Jose's labeled version is superseded, so check before re-adding labels.
- Maincloud needs `pnpm db:maincloud` for the duplicate-name fix (no schema change).
- WhatsApp: the card shows in friends games too (phones after RSVP, TV once the invite exists; DECISIONS #47). Not on a public meetup's TV.
- Trov: the repo was connected but the dashboard still lists no repos for the org (`repos: []`, branches "not connected"). A Trov admin needs to run **Sync GitHub** / give Trov's GitHub app access to jacky_boxie in the web app.

## Done recently

- Instagram/Facebook plan sharing, instant completion and live selection sync · Jose (Codex) · `codex/social-share-live-sync`

- Refined vector people, sharper 3D rendering, editorial invitation covers and small-phone accessibility against Updated-for-META · Jose (Codex) · `codex/meta-ui-polish`

- Live Apify scrape every game (no venue reuse); slower, more believable Muse pull (~13 s) and booking (~25 s). · Anish (Claude Code)
- Plan screen redesign: TV is a one-screen dashboard, phone is one ticket; popular-times chart rebuilt. · Prisha (Claude Code)
- Busyness-aware plan time from Google popular times ("Go at 8:00, not 6:00"). · Prisha (Claude Code)
- Menu check: Apify Website Content Crawler proves diet claims with real dishes from each finalist's own site. · Prisha (Claude Code)
- Live Sway Meter: private leans during pitches, anonymous totals on the TV, Most Persuasive as it happens. · Prisha (Claude Code)
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

- `codex/find-my-people-design`: Jose's branch, merged into `claude/modest-cerf-72dq1o` up to `dd46dd1`; it does not have the sway / menu check / timing / plan redesign work yet.
- `find-my-people`, `hear-me-out-build`: earlier Hear Me Out work, now included in the default branch.
- `hidden-gems`, `iteration-1`: the old Pitch Fight app (Next.js), superseded.

## Push log

### 2026-10-24 · codex/social-share-live-sync → Updated-for-META · Jose (Codex)
- **Changed:** replaced WhatsApp UI with Instagram/Facebook sharing, prepared PNG exports and save/copy/open fallbacks; selections respond immediately and roll back on failure; all-complete tasks advance immediately; viewing steps offer shared readiness per pitch. Stale taps/timers, removed players and late AI callbacks are guarded.
- **Verified:** workspace typecheck, 106/106 tests, production web build; 95 live simulator checks using three independent human clients plus host and typed pitches. Final actions synced in5–51ms. Local backend published without deleting data. Share poster layouts visually checked; Instagram native share/cancellation exercised.
- **Not done / unverified:** physical phone social-app handoff and actual posting not tested. Production backend requires publication for the new reducer; only isolated local DB was updated. Existing bundle warnings remain. Trov: not posted (no access).


<!-- Newest first. Template:
### YYYY-MM-DD · <branch> · <who> (<agent, if any>)
- **Changed:**
- **Verified:**
- **Not done / unverified:**
-->

### 2026-10-24 · codex/meta-ui-polish → Updated-for-META · Jose (Codex), native-resolution characters
- **Changed:** removed the fixed2.5x cap; render at native display density within a12MP framebuffer budget and GPU texture/renderbuffer/viewport limits. Detect monitor/zoom DPR changes. Shared face maps512², contact-shadow texture128², sun-shadow map up to2048². Original geometry, animation, expressions, outfits, camera, colors and SVG avatars unchanged.
- **Verified:** 70/70 tests, web typecheck/build, source comparison and independent renderer audit. Resolution calculations preserve native3x/4x phone cases and obey pixel/GPU bounds on large canvases. Browser rendered1280×720CSS at2560×1440pixels,120people with frame count advancing beyond2500; screenshot saved in meta-polish/native-resolution-characters.png.
- **Not done / unverified:** physical-device performance and cross-monitor movement not exercised; density listener cleanup reviewed. Existing bundle warnings remain. Trov: not posted (no access).

### 2026-10-24 · codex/meta-ui-polish → Updated-for-META · Jose (Codex), original characters restored
- **Changed:** restored original 2D avatar paths, 3D outfit seeding, picker presentation, hero wash and badge styling. The only remaining character changes against Updated-for-META are higher canvas pixel density (cap 1.5→2.5, adaptive pixel budget) and face texture resolution (128→256). Poster and mobile usability work retained.
- **Verified:** exact source comparisons prove geometry, animation, camera, lights, materials, crowd CSS, original avatar art and outfit assignment match the base branch after normalizing only the two resolution changes. Independent read-only character audit agreed. Web typecheck/build and visual hero review passed; screenshot in meta-polish/original-3d-characters.png.
- **Not done / unverified:** physical-device performance still needs review. Trov: not posted (no access).

### 2026-10-24 · codex/meta-ui-polish → Updated-for-META · Jose (Codex), live Muse cover
- **Changed:** ran two genuine Muse Image generations; refined the coffee composition from a lone empty cup to two filled cups on cobalt linen. Generated covers retain their square composition, with native typography over the quiet upper area for short venue names. Added an image-only preview command that never substitutes fallbacks. Saved both model outputs, generation receipts and a standalone final poster under `docs/ui-verification/meta-polish/muse-live/`.
- **Verified:** two live provider responses (about 18s and 13.5s); both returned valid viewable JPEGs. Visually compared both and reviewed the final rendered/exported poster. 70/70 tests, full workspace typecheck and web build passed. Credentials used only in the request subprocess environment, never saved to repository files.
- **Not done / unverified:** only coffee art direction was visually sampled; other categories still need live visual review. Physical-device/microphone checks remain outstanding. Existing bundle warnings remain. Trov: not posted (no access).

### 2026-10-24 · codex/meta-ui-polish → Updated-for-META · Jose (Codex), poster correction
- **Changed:** removed illustrated poster covers. Muse Image remains the primary generator with independent-magazine photography direction, real materials and natural light; generated lettering/illustration/CGI are prohibited. Actual venue photo is the loading/failure fallback; missing images leave a clean typographic invitation. Accurate event typography remains native UI. Supersedes the vector-poster direction in the previous entry.
- **Verified:** web typecheck, 70/70 tests (including photographic prompt requirements and existing safe transport/storage boundaries), production build; real plan visually shows venue-photo fallback with correct attribution. Existing character improvements retained.
- **Not done / unverified:** live Muse image output not sampled because the isolated preview uses fixture mode; provider transport is covered by mocked tests. Physical-device and microphone checks remain outstanding. Trov: not posted (no access).

### 2026-10-24 · codex/meta-ui-polish → Updated-for-META · Jose (Codex)
- **Changed:** preserved the latest Meta mobile flow; redrew scalable character contours, matched selected outfits to the 3D lobby, improved retina rendering and face texture resolution, replaced oversized flat poster decoration with five original vector covers, moved accurate event details above artwork, tightened Muse cover direction, shortened join/scouting copy, and improved safe areas, focus, touch targets and 320px action layout.
- **Verified:** full workspace typecheck, 70/70 tests and production web build; real local room TYDH at 320px and 390px (join/selected avatar, basics, warm-up, playback/reaction/live sway, vote, plan RSVP and invitation). Reviewed five cover motifs and long titles, enlarged vector portrait, and desktop plan. Browser error log empty. Preview uses an isolated local fixture database, no paid model requests succeeded.
- **Not done / unverified:** physical iOS/Android devices and microphone capture; the typed-pitch form was inspected but its submission timed out during this run. Live Meta image output not sampled. Higgsfield GPT Image 2.5 max/4K generation rejected because the connected account requires a paid plan; no asset was generated or subscription changed. Existing bundle-size warnings remain. Trov: not posted (no access).

### 2026-10-24 · Updated-for-META · Prisha (Claude Code)
- **Changed:** finished the `export/` mobile design: home on phones (join-by-code field, Find my people, "Hosting? Open on a TV or laptop", pinned at the bottom; desktop home unchanged), the join screen (back + room code, "Who's making the case?", 4-column avatars with taken ones faded, safety box, "I'm in!" pinned), and the three profile steps (segmented budget/travel, toggle chips, collapsible dietary needs, Muse cards, tag list with remove + add, actions pinned). Layout and styles only. Anish's latest fixes on `fix-names-whatsapp-muse` (`cc94a6a`, `0496aee`) were already in this branch.
- **Verified:** `pnpm typecheck` clean, `pnpm test` 70/70; home and join screens checked at 390×844 with no console errors.
- **Not done / unverified:** profile steps and in-game phone screens not clicked through in a browser yet. Trov: not posted (no access).

### 2026-10-24 · Updated-for-META · Prisha (Claude Code)
- **Changed:** every phone screen in the mobile player-app design from `export/`: shared header (you, room · phase, sound, timer ring) with an 8-step phase rail; scrolling body with the primary action pinned at the bottom; lobby, hot take, swipeable finalist cards with photos, compact ballot/vote rows, case file, record (collapsible case, big record button, Send it / Redo pinned), playback (speaker + photo, transcript, sway bar and lean picker merged into one card, reactions, OBJECTION! pinned), verdict with photo and awards, plan ticket with RSVP segment and Timing / Menu / Invite tabs plus a 4-button action bar. Profile steps and the join page are mapped onto the same style without markup changes. Layout and styles only: same data, conditions and reducer calls. Also applied Anish's `0496aee` (live Apify scrape every game, slower Muse pull and booking; DECISIONS #50).
- **Verified:** `pnpm typecheck` clean, `pnpm test` 70/70, `pnpm sim` 36/36.
- **Not done / unverified:** the new phone screens were not clicked through in a browser before this push (only typecheck, tests and the simulator); Home's mobile layout from the export not applied. Trov: not posted (no access).

### 2026-10-24 · fix-names-whatsapp-muse · Anish (Claude Code)
- **Changed:** venue scouting no longer reuses earlier Apify results (was a 6 h cache), so every game runs a real Google Maps scrape when the place is picked; `pnpm prewarm` is removed (DECISIONS #46). Muse's "pulling your info" now takes ~13 s and the booking ~25 s over four steps (contacting, checking availability, requesting, waiting to confirm).
- **Verified:** `pnpm typecheck` clean, `pnpm test` 54/54, `pnpm sim` 24 and `pnpm sim:match` 16 checks (DEMO_MODE, so no Apify spend), `pnpm web:build:maincloud` built.
- **Not done / unverified:** no live Apify run tested (it costs credits); timings not watched in the browser. Each game, and each place/category change in the lobby, now spends one Apify run. Trov: not posted (no access).

### 2026-10-24 · Updated-for-META · Prisha (Claude Code)
- **Changed:** new branch on top of `claude/modest-cerf-72dq1o`. Find my people page in the mobile player-app design from the `export/` design file (layout and styles only; same fields, 18+ rule, `joinMatchmaking` call and redirect). Restaurant photos on the brief, the phone's pitch card, the lean picker, the verdict (TV + phone) and both plan screens, bigger on phone finalist cards and the matched-room stage. Calmer results: no invite paragraph or per-person "why" list on the TV plan, menu proof as dish-name chips, silent when there's nothing to prove. Applied Anish's `fix-names-whatsapp-muse` fix commit (`cc94a6a`: duplicate names never block a join, friends rejoin by name, WhatsApp in friends games incl. the TV QR, Muse shown as connected, ruling text) without merging that branch's older base. DECISIONS #47–#49.
- **Verified:** `pnpm typecheck` clean, `pnpm test` 70/70, `pnpm sim` 36/36, `pnpm sim:match` 16/16. Find my people page checked in a browser at 390×844 and 1280×860 (button enables only with a name + 18+, pinned at the bottom, no console errors).
- **Not done / unverified:** photo and results changes not re-checked in a browser after the last edits; rest of the `export/` design (lobby, profile, finalists, playback, plan) not applied; Maincloud not republished (`pnpm db:maincloud` needed for the name fix). Trov: not posted (no access).

### 2026-10-24 · deploy-combined · Anish (Claude Code)
- **Changed:** (1) Names: "Find my people" is one shared queue per category, so a stale or repeated first name (e.g. "anish") blocked everyone else and the queue capped at 8; now the queue has no cap or name rule and the matcher numbers clashes ("Sam 2"). In friends games, joining with a disconnected player's name takes back that seat from a new window; any other clash gets a number instead of an error (DECISIONS #45). (2) WhatsApp group now shows in friends games too: on phones after "I'm in" (with a hint before), and on the friends-game TV once someone adds the invite (#44). (3) Muse is shown as connected again with no demo wording: home pill, profile auto-pull, "Reserved · Booked by Muse"; the TV lobby's "Demo spot" button now shows the street (#40, `CLAUDE.md` rule). (4) The Judge's ruling no longer ends in ".." ("not 2am."). (5) README screenshots retaken in the new UI.
- **Verified:** `pnpm typecheck` clean, `pnpm test` 54/54 (new tests for the ruling text and name numbering), `pnpm sim` 24, `pnpm sim:strangers` 15, `pnpm sim:match` 16 (new: a stale queue name doesn't block, friends rejoin keeps the seat, a second "Zed" becomes "Zed 2"), `pnpm web:build:maincloud` built. In the browser against a local server: home "Muse is connected" dialog, profile auto-pull, a friends game through to the plan with "Reserved", the WhatsApp paste box, then the QR on the phone and on the TV; no console errors.
- **Not done / unverified:** Maincloud not republished (needs `pnpm db:maincloud`) and not deployed to Vercel. QR not scanned with a real phone. Trov: not posted (no access).

### 2026-10-24 · deploy-combined · Anish (Claude Code)
- **Changed:** new branch that merges the default branch (WhatsApp QR, STATUS.md, pre-push hook) with Jose's latest `codex/find-my-people-design` commits (cover art, hardened controls, labeled Muse demo). No conflicts. Jose's labeled Muse wording won the merge in `CLAUDE.md` and DECISIONS #40. No backend changes since `82e7020`, which Maincloud already runs.
- **Verified:** `pnpm typecheck` clean, `pnpm test` 53/53, `pnpm sim:match` 13 checks against a local server, `pnpm web:build:maincloud` built.
- **Not done / unverified:** didn't click through the WhatsApp QR or cover art in a browser on this merge. Trov: not posted (no access).

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

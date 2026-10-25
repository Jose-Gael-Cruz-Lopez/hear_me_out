# Meta branch UI review — 2026-10-24

Base: `origin/Updated-for-META` at `6f8960c`.
Branch: `codex/meta-ui-polish`. Preview: http://localhost:5175/.

## Changes

- Native SVG character contours with readable faces, no bitmap tracing or filters.
- Selected outfit passed into the existing 3D lobby; higher retina render density
  under a pixel budget and 256px face textures.
- Muse Image is the primary cover generator, with editorial photography direction.
  The actual venue photo is the pending/failure fallback; if both images fail,
  the invitation remains typographic. No illustrated poster fallback.
  Event name and time come first as selectable HTML text.
- Art-only Muse prompts retain the existing transport safety guard and 600-character
  storage contract, with crisper contours and stronger composition instructions.
- Short join/scouting copy, expandable meetup safety, safe-area spacing, 16px fields,
  visible keyboard focus, touch targets, reduced-motion support and narrow-screen
  two-column final actions. Latest mobile shell, phase rail and backend calls retained.

## Browser evidence

Used a separate local database `hear-me-out-meta-ui` on the existing local server.
Room TYDH: two bots and one browser player. Venue and AI outputs were fixtures.
Checked real game at 390px and 320px: join and selected person, basics screen,
warm-up, finalists/ballot state, recorder/type form, playback, Funny reaction,
live lean (visible 67%/33% update), vote/verdict, Yes RSVP and expanded invitation.
No microphone capture. Typed-pitch submission was not completed before its timer
expired. Final plan on desktop and all five cover motifs with a long-title fixture
were visually reviewed. Temporary review routes were removed.

`invitation-photo-fallback.png` shows the real final plan with venue-photo fallback.
The previously reviewed vector covers were removed after the user clarified the
art direction; their gallery review is historical evidence only.
Browser console error log: empty on host preview.

## Checks and limits

Full workspace typecheck; 70 tests; production web build. Existing bundle-size
warnings remain. Responsive browser checks are not physical-device certification.
No real reservations or messages were sent. No production backend was changed.

Higgsfield: discovered GPT Image 2.5 and requested max quality at 4K. The account
reported free plan, zero credits, and rejected generation with
`job_minimum_basic_plan_required`. No generated asset exists, and no paid plan was
purchased. That Higgsfield attempt is historical; poster generation uses the existing Muse
Image integration. Live Muse image output remains unverified.

## Live Muse validation — subsequent pass

The missing credential was supplied for this run and used only in the request
subprocess environment. Two real `muse-image-1.0` requests succeeded. Both raw
JPEGs and SHA-256/prompt receipts are in `muse-live/`. No stock image, SVG or other
model was used. V1 was rejected as too empty and product-like; v2 uses two filled
cups and a closer arrangement. Reviewed v2 inside the actual Poster component,
then exported the rendered markup and fonts to a self-contained `poster.html`.
`final-poster.png` is its browser screenshot. Typography is app-rendered; Muse
produced the photographic artwork. The scene is conceptual cover art, not a
photograph of the real venue. This supersedes the earlier live-output limitation.
Other activity categories have not yet received live visual review.

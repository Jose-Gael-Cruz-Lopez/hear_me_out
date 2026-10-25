# Category flow verification

Food, Activity and Movie were exercised against the current Vite app and the isolated local SpacetimeDB database `hear-me-out-meta-ui` on port 3002. The worker used offline AI and recorded venue data. No microphone, production rooms, paid model calls, purchases or ticket bookings were used.

## Fixes

- Movie previously substituted the Activity fixture list because its cinema list was empty. It now has four cinemas verified against official venue sites, with coordinates from OpenStreetMap. Unknown prices, ratings and hours remain unknown; no showtime is invented.
- Live and recorded results are filtered by the chosen category and deduplicated. Activity excludes retail, lodging and transit search noise. Two valid live places are sufficient; four are no longer required.
- Category/location changes cancel both queued and running scouts, so a late result cannot replace the current search. Repeating the same setup keeps the finished search status.
- Non-food venues no longer receive unsupported vegan/vegetarian fit badges. Unknown hours do not produce a claim that a venue is verified open.
- Sparse cinema records still produce three usable case hints. The Movie lobby and plan explain that the time is a meetup time and films, showtimes and ticket prices need checking with the cinema.
- The shortlist no longer repeats a place when constraints are relaxed.

## Evidence

- `pnpm test`: **126 tests passed**, including category filtering, fallback selection, sparse data, live-result handling and stale-scout regressions.
- `pnpm typecheck`: passed. The added matchmaking script also passes `pnpm exec tsc -p scripts/tsconfig.json`.
- `pnpm --filter @hmo/web build`: passed; existing bundle-size warnings remain.
- `sim-completion.ts --category=food`: **97 checks passed**.
- `sim-completion.ts --category=activity`: **99 checks passed**.
- `sim-completion.ts --category=movie`: **99 checks passed**.
- `sim-categories.ts`: **19 checks passed** across host-less Food, Activity and Movie matchmaking.

The completion audits use a host plus three independent scripted player identities, normal timers, typed pitches, private ballots, live leans, per-pitch readiness and three RSVPs. They verify correct category data and 90/120/150-minute final plans. Receipts are saved alongside this file.

Browser checks verified Activity selection, a rapid Food -> Activity -> Movie switch, category-specific finalist cards and final plan rendering. The Movie browser error log was empty. Screenshots are included here.

## Cinema fallback sources

Official directories verified October 25, 2026:

- [AMC Kabuki 8](https://www.amctheatres.com/movie-theatres/san-francisco/amc-kabuki-8)
- [The Vogue Theater](https://www.voguemovies.com/)
- [The 4 Star Theater](https://www.4-star-movies.com/contact)
- [AMC Metreon 16](https://www.amctheatres.com/movie-theatres/san-francisco/amc-metreon-16)

Per-venue source URLs and OSM coordinate provenance are stored under `movieProvenance` in the venue fixture. The original food/activity Apify records are preserved.

## Deployment and limits

Local backend publication succeeded without a schema migration or data reset. Production has not been changed. Rollout requires publishing the module, restarting/updating the production orchestrator (it loads fixture data at startup), and deploying the web build. The connected Vercel account does not contain this project.

Movie currently chooses a **cinema**, not a particular film or a verified screening. Reservations/connectors remain the repository's existing simulation; no booking is made. Live Apify/Muse output, device microphone capture and physical phone social-app sharing were not exercised in this audit.

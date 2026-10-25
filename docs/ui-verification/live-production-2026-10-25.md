# Production game audit · 25 October 2026

App: https://hear-me-out-jose.vercel.app/
Original deployment: ApPu9zsbMGCimPFAUPUj46u9x96E
Fix pushed: 0bba4f0 (hosting PR #8)

## Full games

Three independent player tabs per room: AveryQA, BlairQA, CaseyQA. No bots and no microphone. Explicit synthetic preference text was supplied; personal accounts were not read.

- Activity room TDRR, database room 5: live Apify returned 44 venues as partial results at its 85-second wait cap. Finalists were Final Final, Level2 Karaoke, and San Francisco Go Club. All three manually voted for San Francisco Go Club. Ready final plan 7–9 PM; 3 yes RSVPs; image cover generated. False closing-time claim (2 AM) was sustained against recorded 9 PM closing time.
- Movie room DEJX, database room 6: live Apify cinema scrape completed in 37 seconds with 12 results, 7 after category filtering. Finalists Presidio Movie Theater, AMC Kabuki 8, Smokey Spot. Three manual votes for Presidio Movie Theater. Ready final plan 7–9:30 PM; 3 yes RSVPs; image cover generated. True rating/review-count claim verified (4.3 stars, 285 reviews).

## Exercised controls

Join and avatars; reload/rejoin without duplicate seat; budget/travel/availability/vibe; editable profile context; live Muse tag distillation; add/remove/approve tags; personalized warm-up answers; finalists readiness; private favorite selection and change; case readiness; typed-pitch submission; three reactions; anonymous lean totals; ready-to-advance playback; objection; final vote; result-to-plan; RSVP Maybe/Can't/Yes and group count; copy invite/share; Google Calendar draft URL and Maps place ID; downloaded RFC-style CRLF calendars; Instagram/Facebook fallback panels; downloaded invitation poster.

Calendar files verified: Activity UID plan-5 and 120-minute event, Movie UID plan-6 and 150-minute event. No invitations sent, calendar events saved to accounts, or real purchases/bookings made. Browser warning/error log empty on both tested player tabs. Hosted worker logs show live Muse profile/warm-up/curate/assign/factcheck/plan-copy/image calls.

## Correction

Initial Movie plan inherited a model-written curation fit claiming “food for you” while plan-copy generation was still pending. Non-food personal fit now remains the deterministic evaluated venue fit in both curation and final plan copy. The model receives the outing category and explicit restrictions on food/ticket/unknown-price claims. Regression tests inject invented food/free-ticket claims in both Activity and Movie and verify they never reach the saved personal fit.

129 tests, workspace typecheck and production web build passed. Existing bundle-size warning remains.

## Limits

This covers Friends games in desktop Chrome with three independent tab identities. Microphone/transcription was excluded by the user. Existing Muse account/calendar connection and reservation are simulations (repository DECISIONS #40). Movie is explicitly a cinema meetup; films/showtimes/ticket inventory require checking separately. No claim of actual ticket reservation is made by this audit. Social sharing uses the desktop fallback; native mobile share-sheet behavior and physical phones were not tested.

## Post-fix live regression

Production deployment 3tTfZbzzsnWHhdBQazTCJ5HYkZKy serves commit 0bba4f0. Fresh Movie room UMFB (database room 7) completed again with three independent players. Live Apify returned 12 records in 37 seconds. All thirteen hosted jobs finished on the first attempt without errors, including profile distillation, warm-up, curation, assignment, all three fact-checks, awards, plan copy and poster. Final Presidio Movie Theater plan retained evaluated personal fit both before and after AI copy generation; no food or invented ticket-price claim. All three RSVP yes. Two Just us votes declined the optional merge by majority without affecting the plan.

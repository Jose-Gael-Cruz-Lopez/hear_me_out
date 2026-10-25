# Character continuity — 24 October 2026

The chosen paper person now appears in the picker, header, live group strip,
reaction feedback and named 3D lobby crowd. The app reuses its own original
paper-person projections; no artwork was copied from Don't Look Up.

The group strip derives speaking, readiness, voting completion and RSVP state
from existing room subscriptions. It never displays a player's private choice.
Walking, speaking, reacting and celebration animate the figures; tapping your
own figure gives a local cosmetic twirl. Reduced-motion preferences disable
the added movement. Short phase cues replace long explanations.

## Verification

- Local room PLLT: real browser player plus two bots; followed setup through
  final plan; selected appearance persisted; Yes RSVP changed the visible status.
- Local room LXHQ: observed real playback, tapped Funny, and verified the
  server reaction animated that player's figure and displayed their name.
- Inspected real app at 390px through a temporary same-origin iframe. Removed
  the temporary QA page after saving the screenshot.
- Type checking, 48 tests and production build passed. Existing bundle-size
  warnings remain. No microphone use or paid model requests in these checks.

## Figma

- Updated the 16 shared avatar masters using original source people.
- Added a 14-state GameCast component family and linked instances in 99 existing
  phone frames, including error recovery and merged-table states.
- Audited existing prototype destinations: no broken links found after the
  main update. These are static states; real-time motion runs in the app.
- Final playback screenshot inspected for clipping, names and button placement.
- This pass updates phone flow and shared avatars; it does not claim that every
  host frame or every interaction is now pixel-identical to the changed app.

Evidence: character-plan-mobile.png, figma-character-playback.png and
figma-character-receipt.json. The latter records the main 95-frame pass; four
additional recovery/merge frames were subsequently updated (87:3832, 87:4084,
87:5219, 87:7194).

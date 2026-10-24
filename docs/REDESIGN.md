# Pitch Fight — UI redesign

The redesign replaced the original UI entirely. Only UI files changed. Reducers, API routes, and game logic are untouched.
Shared UI pieces live in `web/components/shared/`; the big screen is in `web/components/host/` and the phone in `web/components/play/`.

Changed files:
- app/globals.css: new palette (ink + coral/yellow/cyan/lime), motion keyframes, new component classes. Respects prefers-reduced-motion.
- app/layout.tsx: Anton + Nunito via next/font, ambient background layer.
- app/page.tsx: home screen.
- components/shared/ui.tsx: adds Dot, PhaseTrack, Ring, useElapsed, useScores (points derived from existing rows), useToast, Confetti.
- components/shared/PlanCard.tsx: ticket-style plan with RSVP stub.
- components/host/HostScreen.tsx, HostVoice.tsx, CreateLobby.tsx: big-screen redesign.
- components/play/PlayerScreen.tsx, Recorder.tsx: phone redesign.

Notes:
- Points/levels/badges are computed client-side from pitches, votes, and assignments, so every screen shows the same numbers. Nothing is persisted between games.
- The pitch countdown on the big screen is visual only (client timer). The server still doesn't enforce a deadline.
- Not ported from the mock (these need new SpacetimeDB tables/reducers): live emoji reactions + hype meter, squad streaks, the "say a keyword" bonus.

# 3-minute demo

Setup: one Mac drives the TV (projector), 3–4 player windows on other Macs (or side-by-side windows), plus 1–2 bots to fill the room. Practice once end to end; keep the backup recording ready.

## Before you present (10 minutes before)

- [ ] `spacetime start` (or Maincloud, if you deployed) and `pnpm db:publish`
- [ ] `.env`: `DEMO_MODE=0`, `META_API_KEY` and `APIFY_TOKEN` set, `DEMO_LOCATION` = the venue address
- [ ] `pnpm prewarm` → live venues for the demo location are cached for 6 hours (scouting becomes instant; still real Apify data)
- [ ] `pnpm dev`, open the TV at `/`, click once anywhere on the TV page (unlocks sound), sound on
- [ ] One player window per person, each joined and **mic permission already granted** (do a 2-second test recording)
- [ ] Optional for 2:35: a second public meetup room open in another window, so the merge moment can happen
- [ ] Backup: the screen recording of a full round, open in a tab

## Script

**0:00 — The problem.** “Every group chat has this: *idk, where do you want to go?* Forty messages later, nobody's decided. We turned that into a game.” Show the TV home screen, click **Friends game**.

**0:20 — Join + Bring your Muse.** Players join with the code (names + emoji pop in). Host picks **Food** + **Demo spot** → “Found N real places nearby” appears while people join: Apify is already scraping Google Maps. Click **Let's go**. On one player window: pick budget and diet, paste a Muse summary (or link your own Instagram with consent), **approve tags**. Point at the badge: *only what you approve is shared.*

**0:45 — Hot takes while the AI works.** Personalized either/or questions pop up on the TV. “While you argue about pineapple pizza, Muse is checking hours, prices and menus against every person in the room.”

**1:10 — Finalists → the twist.** Four real places slide in, each with a fit line per person. Secret ballot. Then the assignments: “Maya, defend the ramen place like a nature-documentary narrator who just discovered broth.” Hints come from real venue data.

**1:30 — Pitches.** Two players pitch out loud (30 s each). Captions roll on the TV, reactions fly, someone hits **OBJECTION!**. The Judge rules: *“OBJECTION SUSTAINED: it closes at 9 PM, not midnight.”* (Have one pitcher deliberately exaggerate the hours.) Host can tap **Next pitch** to keep time.

**2:10 — Vote → plan.** Live vote bars, confetti, **Most Persuasive** (who flipped votes) and **Best Line**. The plan: a time everyone can make, the poster from Muse Image, *why this works for everyone* naming each person, RSVPs ticking in live, Add to calendar.

**2:35 — Strangers + merge tables.** Open `/lobbies`: public meetups ranked by vibe match (“You'd vibe: you're all into board games and spicy food”), 18+ and first names only. If two groups picked the same place: *“The Taco Lawyers picked the same place at 8pm. Merge tables?”* → both vote yes → one combined table.

**2:50 — How it's built.** One slide (the README diagram): SpacetimeDB is the live world state (game logic in reducers, timers in schedule tables, audio in the database, the AI is itself a client), Apify brings the real world in, and Muse is in every phase.

## If something breaks

- Venue Wi-Fi slow → it still works: scraping falls back to the cache/recorded data; AI calls fall back to offline content.
- A phase hangs → the host's **Skip** button; every waiting phase also has a safety deadline.
- Mic fails → “No mic? Type your pitch instead”; typed pitches are read aloud on the TV.
- Everything fails → play the backup recording.

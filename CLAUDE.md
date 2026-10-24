# Hear Me Out — agent notes

Build plan: `SPEC.md`. Deviations and choices: `DECISIONS.md` (append when you decide something). SpacetimeDB 2.x rules: `AGENTS.md` (shipped by `spacetime init`) and the SpacetimeDB plugin skills.

## Layout

- `apps/module` — SpacetimeDB TypeScript module. `schema.ts` (all tables), `core.ts` (helpers + phase machine), `reducers/*`, `cleanup.ts` (AI fallbacks), `logic/*` (pure, unit-tested, also imported by the orchestrator as `@hmo/module/logic/*`).
- `apps/orchestrator` — Node worker that connects as the admin identity, claims `ai_job`s and calls `finish_*` reducers. Muse/Apify/fixtures live in `src/services`.
- `apps/web` — Vite + React client: TV (`/host/:code`) and player (`/play/:code`).
- `packages/bindings` — generated client bindings (`pnpm db:generate`), shared by web, orchestrator and the sim.
- `packages/shared` — pure TS used everywhere (venue normalization, hours, geo, diet, .ics).
- `fixtures/` — recorded real Apify data for DEMO_MODE.

## Commands

- `spacetime start` — local server (port 3000).
- `pnpm db:publish` / `pnpm db:reset` (wipes data) then `pnpm db:generate` after schema changes.
- `pnpm orchestrator`, `pnpm web`, `pnpm sim` (end-to-end, needs the local server), `pnpm test`, `pnpm typecheck`.

## Rules

- Every AI call needs a timeout and an offline fallback; the module also has a fallback per job kind.
- Never present fixtures or offline content as live AI; label them. Muse profile samples, connector previews and reservation previews are explicitly identified as demos; they do not access accounts or make bookings (`apps/web/src/lib/muse.ts`).
- Breaking schema changes are refused on publish: append columns with `.default(...)` or add tables.

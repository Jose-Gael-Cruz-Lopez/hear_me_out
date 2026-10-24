# Pitch Fight — agent notes

- SpacetimeDB TypeScript skills are vendored in `.claude/skills/typescript-server` and
  `.claude/skills/typescript-client` (from clockworklabs/SpacetimeDB, v2.13). Read them before
  touching `spacetime/` or the client bindings.
- Module: `spacetime/src/index.ts`. Tests: `cd spacetime && npm test` (in-memory harness, no server).
- After changing the module schema/reducers, regenerate bindings:
  `spacetime generate --lang typescript --out-dir web/src/module_bindings --module-path spacetime`
- All Muse (Meta AI) calls live in `web/lib/ai/muse.ts`. Never commit API keys.

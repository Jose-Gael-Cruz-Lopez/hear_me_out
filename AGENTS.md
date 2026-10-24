# AGENTS.md — start here

This repo is **Hear Me Out**. Every coding agent (Claude Code, Codex, Cursor, Gemini, Copilot, …) follows the same guide and the same workflow.

## Which file to read

| Agent | Read |
| --- | --- |
| Claude Code | [`CLAUDE.md`](CLAUDE.md) (loaded automatically) |
| Codex, Cursor, Gemini, Copilot, any other agent | [`CLAUDE.md`](CLAUDE.md): it is the single guide for everyone, not just Claude |

`CLAUDE.md` covers the build, stack, components, commands and rules. Read it before changing code.

Further reading, linked from there:

- [`SPEC.md`](SPEC.md): the build plan.
- [`DECISIONS.md`](DECISIONS.md): deviations and product calls. Append when you decide something.
- [`docs/SPACETIMEDB.md`](docs/SPACETIMEDB.md): SpacetimeDB 2.x rules and CLI reference (from `spacetime init`). Read before touching `apps/module`.
- [`STATUS.md`](STATUS.md): what is in flight and the push log.

## The workflow (required for every agent)

1. **Before you start:** read `STATUS.md` so you don't redo or clash with work in flight. Add your task under **In progress**.
2. **Before every push:** update `STATUS.md` in one of the commits you are pushing. Add a **Push log** entry and move your task between sections. The `pre-push` hook blocks the push until you do. Turn it on once per clone with `git config core.hooksPath .githooks` (see `CLAUDE.md` → Workflow).
3. **After every push:** post the push to the team's Trov feed (`Shipped:` entry, see `CLAUDE.md` → Trov). Agents without Trov access say so in their Push log entry instead.

Never bypass the hook (`--no-verify`) unless a person tells you to, and say so in the next `STATUS.md` entry.

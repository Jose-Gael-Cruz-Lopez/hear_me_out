# Deploy Hear Me Out in your own Vercel account

The root `vercel.json` builds the Vite frontend and starts one continuous `judge` daemon. Vercel owns the worker lifecycle, so closing a teammate's laptop no longer stops AI jobs. Multiplayer state remains in SpacetimeDB Maincloud.

## Vercel project

Import this repository into the intended Vercel account. Keep the **project root at the repository root** (`.`), rather than `apps/web`: Vercel Daemons currently require a root-level project. The root configuration selects `apps/web/dist` as the static output and builds the worker from `Dockerfile.worker`.

Use the deployment branch containing this configuration; once merged, use `Updated-for-META` as the production branch. Pushes to that branch should rebuild both the website and the worker. Preview deployments do not start a daemon during Vercel's current beta.

## Environment

Configure values directly in Vercel's environment-variable settings. Do not put secret values in Git, build commands, chat messages or public `VITE_` variables.

| Name | Type | Purpose |
| --- | --- | --- |
| `SPACETIMEDB_URI` | Config | `wss://maincloud.spacetimedb.com` |
| `SPACETIMEDB_DB_NAME` | Config | Name of the database you published; frontend and worker must use the same name |
| `SPACETIMEDB_TOKEN` | Secret | Publisher identity for that database; worker-only |
| `META_API_KEY` | Secret | Meta Model API credential for Muse Spark/Image/Voice |
| `APIFY_TOKEN` | Secret | Live places and opt-in public social profiling |
| `DEMO_MODE` | Config | `0` for live providers; `1` for explicitly recorded/offline data |
| `DEMO_LOCATION` | Config | Optional starting neighborhood/address |

The Vite config forwards only the database URI/name and optional demo location into the public build. Model keys, Apify credentials and the database publisher token stay in the daemon environment.

The existing database publisher must publish the current module, or you can sign in to your own SpacetimeDB account and publish a new database. A newly signed-in anonymous identity is insufficient to create a Maincloud database. The daemon verifies `whoAmI` at startup and fails when its token is not the publisher identity.

## Worker lifecycle

One 1GiB Linux/amd64 worker runs in `iad1`. Its state, media and job queue live in SpacetimeDB; container storage is disposable. It stops accepting new jobs on SIGTERM and drains in-flight calls for up to 125 seconds inside a 135-second platform grace period. Existing job claim transactions prevent double processing during a rolling deployment.

## Verify before announcing the URL

1. Website build reports ready in the correct Vercel account/project.
2. Daemon logs show `ready`, the intended Maincloud database, and the expected Muse/Apify configuration.
3. A new room completes scouting and creates category-correct finalists.
4. Complete a typed-pitch Food, Activity and Movie game through votes, RSVP and final plan.
5. Close any laptop worker used previously; repeat scouting with only the hosted daemon running.

No real purchase or venue reservation is made by the repository's existing simulated reservation UI. Movie chooses a cinema and meetup time; verified films/showtimes require a separate source.

Official references: [Daemons](https://vercel.com/docs/daemons), [configuration](https://vercel.com/docs/daemons/config-reference), [limits](https://vercel.com/docs/daemons/limits).

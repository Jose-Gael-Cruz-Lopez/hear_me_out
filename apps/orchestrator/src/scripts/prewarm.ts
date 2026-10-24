// pnpm prewarm — scrape real venues for DEMO_LOCATION now (live Apify) and store them in the
// 6-hour venue_cache, so the demo's scouting step is instant. It is still real Apify data.
import { loadConfig } from '../config';
import { resolveVenueSet } from '../jobs/handlers';
import { createMuse } from '../services/muse';
import { loadFixtureAreas } from '../services/venues';
import { connect } from '../stdb';

const cfg = loadConfig({ demoMode: false });
if (!cfg.apifyEnabled) throw new Error('APIFY_TOKEN is not set');
const conn = await connect(cfg);
const d = { cfg, conn, muse: createMuse(cfg), fixtures: loadFixtureAreas(cfg.fixturesDir) };
const categories = process.argv.slice(2).length ? process.argv.slice(2) : ['food', 'activity'];
const results = await Promise.all(categories.map(category => resolveVenueSet(d, { category, locationLabel: cfg.demoLocation, lat: 0, lng: 0, hasGeo: false })));
results.forEach((r, i) => console.log(`${categories[i]}: ${r.count} venues (${r.source}) → ${r.key}`));
conn.disconnect();
process.exit(0);

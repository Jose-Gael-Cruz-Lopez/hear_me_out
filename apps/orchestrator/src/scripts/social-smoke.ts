// One live run of the social path: vibe-profiler core + Apify scrapers + Muse, on a public brand account.
import { loadConfig } from '../config';
import { profileSocial } from '../services/social';

const summary = await profileSocial(loadConfig({ demoMode: false }), [{ platform: 'instagram', handle: process.argv[2] ?? 'natgeo' }]);
console.log(JSON.stringify(summary, null, 2));

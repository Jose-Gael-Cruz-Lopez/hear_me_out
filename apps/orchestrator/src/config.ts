import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Falls back to the token saved by `spacetime login`, so local dev works without copying it into .env. */
function cliToken(): string {
  const file = join(homedir(), '.config', 'spacetime', 'cli.toml');
  if (!existsSync(file)) return '';
  const m = readFileSync(file, 'utf8').match(/^spacetimedb_token\s*=\s*"([^"]+)"/m);
  return m?.[1] ?? '';
}

const env = (k: string) => (process.env[k] ?? '').trim();

export interface Config {
  demoMode: boolean;
  metaApiKey: string;
  museModel: string;
  museImageModel: string;
  museVoiceModel: string;
  museBaseUrl: string;
  apifyToken: string;
  stdbUri: string;
  dbName: string;
  stdbToken: string;
  demoLocation: string;
  fixturesDir: string;
  /** Muse is used only when not in demo mode and a key is present. */
  museEnabled: boolean;
  apifyEnabled: boolean;
  maxMuseCallsPerRoom: number;
  concurrency: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const demoMode = env('DEMO_MODE') === '1';
  const metaApiKey = env('META_API_KEY') || env('MODEL_API_KEY');
  const apifyToken = env('APIFY_TOKEN');
  const base: Config = {
    demoMode,
    metaApiKey,
    museModel: env('MUSE_MODEL') || 'muse-spark-1.3',
    museImageModel: env('MUSE_IMAGE_MODEL') || 'muse-image-1.0',
    museVoiceModel: env('MUSE_VOICE_MODEL') || 'muse-voice-transcribe-1.0',
    museBaseUrl: env('MUSE_BASE_URL') || 'https://api.meta.ai/v1',
    apifyToken,
    stdbUri: env('SPACETIMEDB_URI') || 'ws://127.0.0.1:3000',
    dbName: env('SPACETIMEDB_DB_NAME') || 'hear-me-out',
    stdbToken: env('SPACETIMEDB_TOKEN') || cliToken(),
    demoLocation: env('DEMO_LOCATION') || '3301 Lyon St, San Francisco, CA 94123',
    fixturesDir: resolve(import.meta.dirname, '../../../fixtures'),
    museEnabled: !demoMode && !!metaApiKey,
    apifyEnabled: !demoMode && !!apifyToken,
    maxMuseCallsPerRoom: 80,
    concurrency: 6,
  };
  const merged = { ...base, ...overrides };
  merged.museEnabled = !merged.demoMode && !!merged.metaApiKey;
  merged.apifyEnabled = !merged.demoMode && !!merged.apifyToken;
  return merged;
}

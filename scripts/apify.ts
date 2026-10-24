// Tiny Apify REST client shared by the fetch scripts: start an actor run, poll until it finishes,
// read its dataset. Needs APIFY_TOKEN (env, .env or web/.env.local).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env', 'web/.env.local']) if (existsSync(join(ROOT, f))) process.loadEnvFile(join(ROOT, f));

export function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

export function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function token() {
  const t = process.env.APIFY_TOKEN;
  if (!t) {
    console.error('APIFY_TOKEN is not set (see web/.env.example).');
    process.exit(1);
  }
  return t;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.apify.com/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`Apify ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export interface RunResult {
  runId: string;
  items: Record<string, unknown>[];
}

/** Runs an actor to completion and returns its dataset items. `label` prefixes progress lines. */
export async function runActor(actor: string, input: unknown, label = actor, timeoutMin = 15): Promise<RunResult> {
  const run = (await api(`/acts/${actor}/runs`, { method: 'POST', body: JSON.stringify(input) })).data;
  console.log(`[${label}] run ${run.id} started`);
  const deadline = Date.now() + timeoutMin * 60_000;
  let status = run.status as string;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
    if (Date.now() > deadline) {
      await api(`/actor-runs/${run.id}/abort`, { method: 'POST' }).catch(() => {});
      throw new Error(`gave up after ${timeoutMin} min`);
    }
    await new Promise(r => setTimeout(r, 10_000));
    status = (await api(`/actor-runs/${run.id}`)).data.status;
    console.log(`[${label}] ${status}`);
  }
  if (status !== 'SUCCEEDED') throw new Error(`run ended with ${status}`);
  const items = (await api(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`)) as Record<string, unknown>[];
  console.log(`[${label}] ${items.length} items`);
  return { runId: run.id, items };
}

// Real Muse Image only. Never substitutes fixtures, stock photos or another model.
// From repo root:
// pnpm --filter @hmo/orchestrator exec tsx --env-file-if-exists=../../.env src/scripts/muse-cover-preview.ts "Pat's Cafe" "Cafe" /tmp/muse-cover
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../config';
import { createMuse } from '../services/muse';
import { coverArtPrompt } from '../services/cover-art';

const [title = "Pat's Cafe", category = 'Cafe', destination = '/tmp/hear-me-out-muse-cover'] = process.argv.slice(2);
const cfg = loadConfig({ demoMode: false });
if (!cfg.metaApiKey) {
  throw new Error('Muse Image preview requires META_API_KEY or MODEL_API_KEY in the project environment. No image generated; no fallback used.');
}
const prompt = coverArtPrompt(title, category);
const started = Date.now();
const result = await createMuse(cfg).image(prompt, 0n);
if (!result?.bytes.length) {
  throw new Error('Muse Image did not return an image. Review the provider status above. No fallback used.');
}
const dir = resolve(destination);
await mkdir(dir, { recursive: true });
const extension = result.mime === 'image/png' ? 'png' : 'jpg';
const imagePath = resolve(dir, `muse-cover.${extension}`);
await writeFile(imagePath, result.bytes);
await writeFile(resolve(dir, 'generation.json'), JSON.stringify({
  provider: 'Meta Muse Image', requestedModel: cfg.museImageModel,
  title, category, prompt, mime: result.mime, bytes: result.bytes.length,
  sha256: createHash('sha256').update(result.bytes).digest('hex'),
  generatedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
  fallbackUsed: false,
}, null, 2) + '\n');
console.log(`Real Muse cover saved: ${imagePath}`);

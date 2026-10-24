// Smoke test for the live Meta Model API through our own client: structured JSON, transcription, image.
// Usage: pnpm --filter @hmo/orchestrator exec tsx --env-file=../../.env src/scripts/muse-smoke.ts <speech-audio-file>
import { readFileSync } from 'node:fs';
import { loadConfig } from '../config';
import * as prompts from '../prompts';
import { toWav } from '../services/audio';
import { createMuse } from '../services/muse';

const cfg = loadConfig({ demoMode: false });
const muse = createMuse(cfg);
if (!muse.enabled) throw new Error('Muse is not enabled (no key?)');
const room = 0n;

const t0 = Date.now();
const fact = await muse.json({
  ...prompts.factcheck,
  input: {
    transcript: 'Pho Real is open until midnight and has five stars!',
    venue: { title: 'Pho Real', category: 'Vietnamese restaurant', price: '$$', rating: 4.4, reviewCount: 812, minutesAway: 14, hoursToday: '11 AM–9 PM', dietaryNotes: [] },
  },
  effort: 'low',
  roomId: room,
});
console.log('factcheck:', JSON.stringify(fact), `${Date.now() - t0}ms`);

const audioFile = process.argv[2];
if (audioFile) {
  const t1 = Date.now();
  const wav = await toWav(new Uint8Array(readFileSync(audioFile)), 'audio/aiff');
  const text = await muse.transcribe(wav, room);
  console.log('transcribe:', JSON.stringify(text), `${Date.now() - t1}ms`);
}

const t2 = Date.now();
const img = await muse.image('Vertical festive party invite poster, bold game-show style, big readable title "Pho Real" and the time "Tonight 7:30 PM", confetti.', room);
console.log('image:', img ? `${img.mime} ${Math.round(img.bytes.length / 1024)} KB` : 'none', `${Date.now() - t2}ms`);

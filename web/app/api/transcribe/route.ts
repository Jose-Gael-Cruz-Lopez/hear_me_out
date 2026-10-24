import { NextResponse } from 'next/server';
import { withFallback } from '@/lib/ai/muse';

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get('audio');
  const hint = String(form.get('hint') ?? '');
  if (!(audio instanceof Blob)) return NextResponse.json({ error: 'No audio' }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'Recording too long' }, { status: 413 });
  const r = await withFallback('transcribe', ai => ai.transcribe(audio, hint), 20_000);
  return NextResponse.json({ text: r.value, ai: r.mode });
}

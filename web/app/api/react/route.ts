import { NextResponse } from 'next/server';
import { withFallback } from '@/lib/ai/muse';
import type { ReactRequest } from '@/lib/api-types';

export async function POST(req: Request) {
  const body = (await req.json()) as ReactRequest;
  const r =
    body.kind === 'pitch'
      ? await withFallback('reactToPitch', ai => ai.reactToPitch(body))
      : body.kind === 'bot'
        ? await withFallback('botPitch', ai => ai.botPitch(body))
        : await withFallback('hostPitch', ai => ai.hostPitch(body));
  return NextResponse.json({ line: r.value, ai: r.mode });
}

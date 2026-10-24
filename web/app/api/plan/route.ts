import { NextResponse } from 'next/server';
import { withFallback } from '@/lib/ai/muse';
import type { PlanRequest, PlanResponse } from '@/lib/api-types';

export async function POST(req: Request) {
  const body = (await req.json()) as PlanRequest;
  if (!body.slots?.length) return NextResponse.json({ error: 'No time slots' }, { status: 400 });
  const r = await withFallback('pickTime', ai => ai.pickTime(body));
  // The AI may only choose among the slots we computed.
  const slot = body.slots.find(s => s.slot === r.value.slot) ?? body.slots[0]!;
  const res: PlanResponse = { whenLabel: slot.label, startIso: slot.startIso, blurb: r.value.blurb, ai: r.mode };
  return NextResponse.json(res);
}

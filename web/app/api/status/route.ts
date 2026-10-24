import { NextResponse } from 'next/server';
import { aiHost } from '@/lib/ai/muse';

export function GET() {
  return NextResponse.json({ ai: aiHost().mode });
}

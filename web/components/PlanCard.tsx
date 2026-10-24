'use client';

import { buildIcs, googleCalendarUrl, type InviteInput } from '@/lib/game/ics';
import type { Game } from '@/lib/stdb';
import { price } from './ui';

export function planInvite(g: Game): InviteInput | null {
  const o = g.options.find(x => x.id === g.plan?.optionId);
  if (!g.plan || !o) return null;
  return {
    uid: `${g.code}-${o.id}`,
    title: `${o.name} (Pitch Fight winner)`,
    start: new Date(g.plan.startIso),
    durationMin: g.plan.durationMin,
    location: o.address || o.name,
    description: `${g.plan.blurb}\n\nDecided by Pitch Fight, room ${g.code}.\n${o.mapsUrl}`,
    url: o.mapsUrl,
  };
}

export function downloadIcs(inv: InviteInput) {
  const blob = new Blob([buildIcs(inv)], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pitch-fight-${inv.uid}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function PlanCard({ g, compact }: { g: Game; compact?: boolean }) {
  const o = g.options.find(x => x.id === g.plan?.optionId);
  const inv = planInvite(g);
  if (!g.plan || !o || !inv) return null;
  const going = g.players.filter(p => g.rsvps.find(r => r.playerId === p.id)?.status === 'in');
  const maybe = g.players.filter(p => g.rsvps.find(r => r.playerId === p.id)?.status === 'maybe');
  const out = g.players.filter(p => g.rsvps.find(r => r.playerId === p.id)?.status === 'out');
  return (
    <div className="plan-card pop stack">
      <div className="small" style={{ fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        🎟️ The plan
      </div>
      <h2 className="display" style={{ fontSize: compact ? '2rem' : '3rem', margin: 0 }}>
        {o.name}
      </h2>
      <div style={{ fontSize: compact ? '1.2rem' : '1.6rem', fontWeight: 800 }}>🗓️ {g.plan.whenLabel}</div>
      <div>
        📍 {o.address || o.name} · {price(o.priceLevel)} · {o.category}
      </div>
      <div style={{ fontStyle: 'italic' }}>“{g.plan.blurb}”</div>
      <div className="small">
        <b>In ({going.length}):</b> {going.map(p => p.name).join(', ') || '—'}
        {maybe.length > 0 && (
          <>
            {' '}
            · <b>Maybe:</b> {maybe.map(p => p.name).join(', ')}
          </>
        )}
        {out.length > 0 && (
          <>
            {' '}
            · <b>Out:</b> {out.map(p => p.name).join(', ')}
          </>
        )}
      </div>
      <div className="row">
        <button className="btn pink" onClick={() => downloadIcs(inv)}>
          📅 Add to calendar (.ics)
        </button>
        <a className="btn ghost" href={googleCalendarUrl(inv)} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
        <a className="btn ghost" href={o.mapsUrl} target="_blank" rel="noreferrer">
          🗺️ Directions
        </a>
      </div>
    </div>
  );
}

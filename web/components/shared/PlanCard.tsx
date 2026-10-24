'use client';

import { buildIcs, googleCalendarUrl, type InviteInput } from '@/lib/game/ics';
import type { Game } from '@/lib/stdb';
import { Dot, price } from './ui';

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

const RSVP: Record<string, [string, string, string]> = {
  in: ["I'm in", '#4be37b', '#123a1f'],
  maybe: ['Maybe', '#ffd23f', '#3d2d05'],
  out: ['Out', '#ff5a5a', '#3d0f0f'],
};

export function PlanCard({ g, compact }: { g: Game; compact?: boolean }) {
  const o = g.options.find(x => x.id === g.plan?.optionId);
  const inv = planInvite(g);
  if (!g.plan || !o || !inv) return null;
  const going = g.players.filter(p => g.rsvps.find(r => r.playerId === p.id)?.status === 'in');
  return (
    <div className={`plan-card ${compact ? 'compact' : ''}`}>
      <div className="main">
        <div className="small" style={{ fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          🎟️ The plan
        </div>
        <div className="display" style={{ fontSize: compact ? '2.5rem' : '4.5rem' }}>
          {o.name}
        </div>
        <div style={{ fontSize: compact ? '1.2rem' : '1.75rem', fontWeight: 900 }}>🗓️ {g.plan.whenLabel}</div>
        <div style={{ fontWeight: 700 }}>
          📍 {o.address || o.name} · {price(o.priceLevel)} · {o.category}
        </div>
        {!compact && <div style={{ fontStyle: 'italic', fontWeight: 700 }}>“{g.plan.blurb}”</div>}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn pink" onClick={() => downloadIcs(inv)}>
            📅 {compact ? 'Calendar' : 'Add to calendar (.ics)'}
          </button>
          {!compact && (
            <a className="btn ghost" href={googleCalendarUrl(inv)} target="_blank" rel="noreferrer">
              Google Calendar
            </a>
          )}
          <a className="btn ghost" href={o.mapsUrl} target="_blank" rel="noreferrer">
            🗺️ Directions
          </a>
        </div>
      </div>
      <div className="stub">
        <div className="small" style={{ fontWeight: 900, letterSpacing: '0.16em' }}>
          WHO&apos;S IN · {going.length}/{g.players.length}
        </div>
        {compact ? (
          <div className="row" style={{ gap: 6 }}>
            {g.players.map(p => {
              const s = g.rsvps.find(r => r.playerId === p.id)?.status;
              return (
                <span key={String(p.id)} style={{ opacity: s === 'in' ? 1 : s ? 0.55 : 0.3, transition: 'opacity .3s' }}>
                  <Dot p={p} size={32} />
                </span>
              );
            })}
          </div>
        ) : (
          g.players.map(p => {
            const s = g.rsvps.find(r => r.playerId === p.id)?.status;
            const r = s ? RSVP[s] : undefined;
            return (
              <div key={String(p.id)} className="rsvp-line">
                <Dot p={p} />
                <span>{p.name}</span>
                <span className="rsvp-tag pop" key={s ?? 'wait'} style={{ background: r?.[1] ?? '#283242', color: r?.[2] ?? '#a9b4c2' }}>
                  {r?.[0] ?? '…'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

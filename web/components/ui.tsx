'use client';

import type { Option, Player } from '@/src/module_bindings/types';

const COLORS = ['#ffd23f', '#ff4f9a', '#3de0e0', '#4be37b', '#ff8c42', '#b388ff', '#ff5a5a', '#7ee8fa', '#f9f871', '#c6ff00'];
const FACES = ['😎', '🤠', '🥸', '🤓', '😼', '🦊', '🐸', '🐙', '👽', '🤖'];

export function playerStyle(p: Pick<Player, 'id'>) {
  const i = Number(p.id % BigInt(COLORS.length));
  return { color: COLORS[i]!, face: FACES[i]! };
}

export function Avatar({ p, extra, dim }: { p: Player; extra?: React.ReactNode; dim?: boolean }) {
  const s = playerStyle(p);
  return (
    <div className={`avatar pop ${dim || !p.connected ? 'off' : ''}`}>
      <span className="dot" style={{ background: s.color }}>
        {s.face}
      </span>
      {p.name}
      {extra}
    </div>
  );
}

export function price(level: number) {
  return '$'.repeat(Math.max(1, Math.min(level, 4)));
}

export function distance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function OptionMeta({ o }: { o: Option }) {
  return (
    <div className="muted small">
      {o.category} · {price(o.priceLevel)} · {o.rating ? `${o.rating.toFixed(1)}★` : 'new'} · {distance(o.distanceM)}
    </div>
  );
}

export function posterSrc(o: Option) {
  return o.posterUrl || `/api/poster?${new URLSearchParams({ name: o.name, category: o.category, blurb: o.blurb })}`;
}

export function Spinner() {
  return <span className="spin">⏳</span>;
}

export function ErrorBox({ error }: { error: string }) {
  return error ? <div className="error">{error}</div> : null;
}

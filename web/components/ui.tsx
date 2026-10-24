'use client';

import { useEffect, useState } from 'react';
import type { Option, Player } from '@/src/module_bindings/types';

const COLORS = ['#ffd23f', '#ff4f9a', '#3de0e0', '#4be37b', '#ff8c42', '#b388ff', '#ff5a5a', '#7ee8fa', '#f9f871', '#c6ff00'];
const FACES = ['😎', '🤠', '🥸', '🤓', '😼', '🦊', '🐸', '🐙', '👽', '🤖'];

export function playerStyle(p: Pick<Player, 'id'>) {
  const i = Number(p.id % BigInt(COLORS.length));
  return { color: COLORS[i]!, face: FACES[i]! };
}

export function Avatar({ p, extra, dim, onRemove }: { p: Player; extra?: React.ReactNode; dim?: boolean; onRemove?: () => void }) {
  const s = playerStyle(p);
  return (
    <div className={`avatar pop ${dim || !p.connected ? 'off' : ''}`}>
      <span className="dot" style={{ background: s.color }}>
        {p.isBot ? '🤖' : s.face}
      </span>
      {p.name}
      {p.isBot && <span className="badge">bot</span>}
      {extra}
      {onRemove && (
        <button className="remove" onClick={onRemove} aria-label={`Remove ${p.name}`}>
          ×
        </button>
      )}
    </div>
  );
}

/** Seconds left until a server-set deadline (microseconds since epoch; 0 = none). */
export function Countdown({ deadlineMicros }: { deadlineMicros: bigint }) {
  const end = Number(deadlineMicros / 1000n);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [end]);
  if (!end) return null;
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  return (
    <span className={`badge countdown ${left <= 10 ? 'hot' : ''}`}>
      ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  );
}

export function ReconnectBanner({ show }: { show: boolean }) {
  return show ? <div className="reconnect">📡 Reconnecting to the game board…</div> : null;
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

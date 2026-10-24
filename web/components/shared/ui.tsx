'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Option, Player } from '@/src/module_bindings/types';
import type { Game } from '@/lib/stdb';

const COLORS = ['#ffd23f', '#ff5c39', '#3de0e0', '#4be37b', '#ff9a3d', '#c6ff3d', '#ff5a5a', '#7ee8fa', '#f9f871', '#ffb38a'];
const FACES = ['😎', '🤠', '🥸', '🤓', '😼', '🦊', '🐸', '🐙', '👽', '🤖'];

export const PHASES = ['LOBBY', 'PROFILE', 'OPTIONS', 'PITCH', 'SHOWTIME', 'VOTE', 'RESULT', 'PLAN'] as const;

export function playerStyle(p: Pick<Player, 'id'>) {
  const i = Number(p.id % BigInt(COLORS.length));
  return { color: COLORS[i]!, face: FACES[i]! };
}

export function Dot({ p, bob, size }: { p: Pick<Player, 'id'>; bob?: boolean; size?: number }) {
  const s = playerStyle(p);
  return (
    <span className={`dot ${bob ? 'bob' : ''}`} style={{ background: s.color, ...(size ? { width: size, height: size, fontSize: size * 0.5 } : {}) }}>
      {s.face}
    </span>
  );
}

export function Avatar({ p, extra, dim }: { p: Player; extra?: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`avatar pop ${dim || !p.connected ? 'off' : ''}`}>
      <Dot p={p} />
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
    <div className="muted small" style={{ fontWeight: 800 }}>
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

/** Progress track across the 8 phases. `variant="stage"` is the big-screen header version. */
export function PhaseTrack({ phase, variant }: { phase: string; variant?: 'stage' }) {
  const idx = PHASES.indexOf(phase as (typeof PHASES)[number]);
  return (
    <div className={variant === 'stage' ? 'stage-track' : 'phase-track'}>
      {PHASES.map((p, i) => (
        <div key={p} className={i < idx ? 'past' : i === idx ? 'now' : ''} />
      ))}
    </div>
  );
}

/** Circular progress ring (countdowns, vote completion). */
export function Ring({ pct, color, size, inner, children }: { pct: number; color: string; size: number; inner: number; children: React.ReactNode }) {
  return (
    <div className="ring" style={{ width: size, height: size, background: `conic-gradient(${color} ${Math.max(0, Math.min(1, pct)) * 360}deg, rgba(255,255,255,.08) 0)` }}>
      <div style={{ width: inner, height: inner }}>{children}</div>
    </div>
  );
}

/** Seconds since `key` last changed — drives client-side countdowns without touching the server. */
export function useElapsed(key: string, tickMs = 250) {
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setStart(Date.now());
  }, [key]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return Math.max(0, (now - start) / 1000);
}

// ---------------------------------------------------------------- points (derived, no schema change)

export const POINTS = { pitch: 100, voice: 50, voteReceived: 200, winner: 500 } as const;

export interface Score {
  player: Player;
  total: number;
  lines: { label: string; value: number }[];
  award: string;
}

/** Points are derived purely from rows every screen already subscribes to, so phones and the big screen agree. */
export function useScores(g: Game): Score[] {
  return useMemo(() => {
    const scores = g.players.map(player => {
      const lines: Score['lines'] = [];
      const pitch = g.pitches.find(x => x.playerId === player.id);
      const a = g.assignments.find(x => x.playerId === player.id);
      if (pitch) lines.push({ label: '🎙️ Pitch locked', value: POINTS.pitch });
      if (pitch?.mode === 'voice') lines.push({ label: '🗣️ Voice bonus', value: POINTS.voice });
      const received = a ? g.votes.filter(v => v.optionId === a.optionId).length : 0;
      if (received) lines.push({ label: `🗳️ ${received} vote${received === 1 ? '' : 's'} × ${POINTS.voteReceived}`, value: received * POINTS.voteReceived });
      if (a && g.lobby?.winnerOptionId !== undefined && a.optionId === g.lobby.winnerOptionId && g.votes.length)
        lines.push({ label: '🏆 Winner bonus', value: POINTS.winner });
      if (g.votes.some(v => v.voterId === player.id)) lines.push({ label: '✅ Voted', value: 25 });
      const total = lines.reduce((s, l) => s + l.value, 0);
      return { player, total, lines, award: '', received, voice: pitch?.mode === 'voice', pitched: !!pitch };
    });
    const sorted = [...scores].sort((x, y) => y.total - x.total);
    sorted.forEach((s, i) => {
      s.award =
        i === 0 && s.total > 0
          ? 'Silver Tongue'
          : !s.pitched
            ? 'Bold Strategy'
            : s.received === 0
              ? 'Lone Wolf'
              : s.voice
                ? 'Mic Drop'
                : 'Keyboard Warrior';
    });
    return sorted;
  }, [g.players, g.pitches, g.assignments, g.votes, g.lobby?.winnerOptionId]);
}

// ---------------------------------------------------------------- toasts

export function useToast() {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  return {
    show: (text: string) => setToast({ text, id: Date.now() }),
    node: toast ? (
      <div key={toast.id} className="toast">
        {toast.text}
      </div>
    ) : null,
  };
}

// ---------------------------------------------------------------- confetti

const CONFETTI_COLORS = ['#ffd23f', '#ff5c39', '#3de0e0', '#4be37b', '#ff9a3d', '#c6ff3d'];

export function Confetti({ count = 42 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(Math.random() * 100).toFixed(1)}%`,
        width: 8 + Math.floor(Math.random() * 8),
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animationDuration: `${(2.6 + Math.random() * 2.4).toFixed(2)}s`,
        animationDelay: `${(-Math.random() * 4).toFixed(2)}s`,
      })),
    [count]
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((s, i) => (
        <i key={i} style={s} />
      ))}
    </div>
  );
}

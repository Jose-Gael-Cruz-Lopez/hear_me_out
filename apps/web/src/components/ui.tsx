import { PlanCoverArt } from './PlanCoverArt';
import { IconText, AvatarMark } from './Ink';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Option, Player, Plan } from '@hmo/bindings';
import { isMuted, onMuteChange, play, setMuted, unlockAudio } from '../lib/sound';
import { tsMs, useNow } from '../lib/time';

export const SEAT_COLORS = ['#493f2e', '#315964', '#6b561b', '#3b5a36', '#855438', '#5d4c72', '#8b403b', '#34605b'];
export const seatColor = (seat: number) => SEAT_COLORS[seat % SEAT_COLORS.length];

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'xl' }) {
  return <div className={`ink-logo ${size}`} aria-label="Hear Me Out"><span>Hear</span>{' '}<span>Me</span>{' '}<span>Out</span></div>;
}

export function Avatar({
  player,
  size = 64,
  dim = false,
  done = false,
  bounce = 0,
  label = true,
}: {
  player: Pick<Player, 'avatar' | 'name' | 'seat' | 'isBot' | 'connected'>;
  size?: number;
  dim?: boolean;
  done?: boolean;
  bounce?: number;
  label?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ opacity: dim || !player.connected ? 0.45 : 1 }}>
      <motion.div
        animate={{ scale: 1 + bounce * 0.35, rotate: bounce * 6 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        className="relative grid place-items-center rounded-full"
        style={{ width: size, height: size, background: '#fff', color: '#14140f', border: '1.5px solid #14140f', boxShadow: '2px 3px 0 #14140f', fontSize: size * 0.55 }}
      >
        <AvatarMark value={player.avatar} size={size * .82} />
        {done && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-1 -bottom-1 grid h-7 w-7 place-items-center rounded-full bg-lime text-base font-black text-ink ring-2 ring-ink"
          ><IconText text={" ✓ "} /></motion.span>
        )}
        {player.isBot && <span className="absolute -top-2 rounded-full bg-ink px-2 text-[10px] font-black tracking-widest text-sky ring-1 ring-sky">BOT</span>}
      </motion.div>
      {label && (
        <div className="max-w-28 truncate text-center font-display text-sm font-extrabold" style={{ color: '#14140f' }}>
          {player.name}
        </div>
      )}
    </div>
  );
}

/** Countdown ring driven by the server-authoritative phase deadline. */
export function Countdown({ deadline, startedAt, size = 84, tick = false }: { deadline: Parameters<typeof tsMs>[0]; startedAt: Parameters<typeof tsMs>[0]; size?: number; tick?: boolean }) {
  const now = useNow(200);
  const end = tsMs(deadline);
  const start = tsMs(startedAt);
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  const total = Math.max(1, end - start);
  const frac = end ? Math.max(0, Math.min(1, (end - now) / total)) : 0;
  useEffect(() => {
    if (tick && end && left > 0 && left <= 5) play('tick');
  }, [left, tick, end]);
  if (!end) return null;
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const color = left <= 5 ? '#b42c24' : '#14140f';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#d7d6ce" strokeWidth={8} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 0.2s linear' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display font-black" style={{ fontSize: size * 0.36, color }}>
        {left}
      </div>
    </div>
  );
}

export function MuteButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMuteChange(setM), []);
  return (
    <button
      className={iconOnly ? 'm-round' : 'chip bg-ink-3 text-cream ring-1 ring-white/10'}
      onClick={() => {
        unlockAudio();
        setMuted(!m);
      }}
      aria-label={m ? 'Unmute' : 'Mute'}
    >
      <IconText text={iconOnly ? (m ? '🔇' : '🔊') : m ? '🔇 Muted' : '🔊 Sound on'} size={iconOnly ? 20 : undefined} />
    </button>
  );
}

export function Money({ level }: { level: number }) {
  if (!level) return <span className="text-muted">price unknown</span>;
  return (
    <span>
      <span className="text-lime">{'$'.repeat(level)}</span>
      <span className="text-white/25">{'$'.repeat(4 - level)}</span>
    </span>
  );
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  if (!rating) return <span className="text-muted">no rating</span>;
  return (
    <span>
      <span className="text-sun"><IconText text={"★"} /></span> {rating.toFixed(1)}
      {count !== undefined && <span className="text-muted"> ({count.toLocaleString()})</span>}
    </span>
  );
}

export function VenueImage({ option, className }: { option: Pick<Option, 'imageUrl' | 'title' | 'category'>; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!option.imageUrl || failed) {
    return (
      <div className={`grid place-items-center bg-gradient-to-br from-grape to-pop text-5xl ${className ?? ''}`}>
        <IconText text={/(ramen|noodle|pho)/i.test(option.category) ? '🍜' : /(taco|mexican)/i.test(option.category) ? '🌮' : /(karaoke)/i.test(option.category) ? '🎤' : /(bowl)/i.test(option.category) ? '🎳' : /(game|arcade)/i.test(option.category) ? '🕹️' : '📍'} />
      </div>
    );
  }
  return <img src={option.imageUrl} alt={option.title} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`object-cover ${className ?? ''}`} />;
}

export function VenueCard({ option, players, compact = false, children, highlight }: { option: Option; players?: Player[]; compact?: boolean; children?: ReactNode; highlight?: string }) {
  return (
    <div className="card overflow-hidden" style={highlight ? { boxShadow: `0 0 0 4px ${highlight}, 0 10px 30px rgb(0 0 0 / 0.35)` } : undefined}>
      <VenueImage option={option} className={compact ? 'h-44 w-full' : 'h-48 w-full'} />
      <div className="space-y-2 p-4">
        <div className="font-display text-2xl leading-tight font-black">{option.title}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold">
          <span className="text-sky">{option.category}</span>
          <Stars rating={option.rating} count={option.reviewCount} />
          <Money level={option.priceLevel} />
          <span className="text-cream/80">~{option.travelMin} min</span>
          {option.hoursKnown && option.hoursText && <span className="text-cream/70"><IconText text={"🕒 "} />{option.hoursText}</span>}
        </div>
        {!compact && option.fitSummary && <div className="text-base text-cream/90">{option.fitSummary}</div>}
        {option.stretchNote && <div className="chip bg-tang/20 text-tang ring-1 ring-tang/40"><IconText text={"⚠️ "} />{option.stretchNote}</div>}
        {!compact && players && option.perPlayerFit.length > 0 && (
          <ul className="space-y-1 text-sm">
            {option.perPlayerFit.map(f => {
              const p = players.find(x => x.id === f.playerId);
              return (
                <li key={String(f.playerId)} className="flex gap-2">
                  <span><AvatarMark value={p?.avatar} size={24} /></span>
                  <span className="text-cream/85">{f.line}</span>
                </li>
              );
            })}
          </ul>
        )}
        {children}
      </div>
    </div>
  );
}

/** One shared invitation design on the host and phone, including when Muse is offline. */
export function Poster({ plan, option, imageUrl, players }: { plan: Plan; option: Option | undefined; imageUrl?: string; players: Player[] }) {
  const [failedImage, setFailedImage] = useState<string>();
  // Old persisted posters contain model-rendered venue text. Keep those out of the new cover layout.
  const artUrl = plan.posterPrompt.startsWith('Art-only event cover:') && imageUrl !== failedImage ? imageUrl : undefined;
  return (
    <figure className="event-invitation">
      <figcaption className="event-invitation-copy">
        <div className="event-invitation-eyebrow"><span>HEAR ME OUT</span><span>{option?.category ?? 'The plan'}</span></div>
        <h2 className="event-invitation-title">{option?.title ?? 'The plan'}</h2>
        <p className="event-invitation-time">{plan.slotLabel}</p>
      </figcaption>
      <div className="event-cover">
        {artUrl ? <img src={artUrl} alt="" decoding="async" className="event-cover-art" onError={() => setFailedImage(artUrl)} /> : <PlanCoverArt category={option?.category ?? ''} title={option?.title ?? ''} />}
      </div>
      <div className="event-invitation-bottom">
        <div className="event-invitation-footer">
          <div className="event-invitation-people" role="group" aria-label={`Lobby: ${players.map(p => p.name).join(', ')}`}>
            {players.slice(0, 8).map(p => <span key={String(p.id)}><AvatarMark value={p.avatar} size={26} /></span>)}
          </div>
          <span className="event-invitation-credit">{artUrl ? 'Art by Muse Image' : 'Hear Me Out original art'}</span>
        </div>
      </div>
    </figure>
  );
}

export function useObjectUrl(bytes: Uint8Array | undefined, mime: string | undefined): string | undefined {
  const url = useMemo(() => (bytes && bytes.length && mime ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })) : undefined), [bytes, mime]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export function PhaseTitle({ kicker, title, sub }: { kicker?: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="text-center">
      {kicker && <div className="font-display text-lg font-black tracking-[0.25em] text-sun uppercase">{kicker}</div>}
      <h1 className="font-display text-5xl leading-tight font-black md:text-6xl">{title}</h1>
      {sub && <div className="mt-2 text-xl text-cream/80">{sub}</div>}
    </div>
  );
}

export function AiTicker({ text }: { text: string }) {
  if (!text) return null;
  return (
    <motion.div key={text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="chip bg-grape/30 px-4 py-2 text-base text-cream ring-1 ring-grape/60">
      <span className="inline-block animate-spin"><IconText text={"⚖️"} /></span> {text}
    </motion.div>
  );
}

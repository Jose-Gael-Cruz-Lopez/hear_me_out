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

export function MuteButton() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMuteChange(setM), []);
  return (
    <button
      className="chip bg-ink-3 text-cream ring-1 ring-white/10"
      onClick={() => {
        unlockAudio();
        setMuted(!m);
      }}
      aria-label={m ? 'Unmute' : 'Mute'}
    >
      <IconText text={m ? '🔇 Muted' : '🔊 Sound on'} />
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

/** Original, text-free cover artwork. Exact event typography is always rendered by the app. */
function PlanCoverArt({ category, title }: { category: string; title: string }) {
  const clues = `${category} ${title}`;
  const kind = /movie|cinema|film|theat(?:er|re)/i.test(category) ? 'movie'
    : /activity|board.?game|bowling|arcade|karaoke|music|concert|park\b|outdoor|hiking|museum|gallery/i.test(clues) ? 'activity'
    : /ramen|noodle/i.test(clues) ? 'noodles' : /cafe|café|coffee/i.test(clues) ? 'coffee' : 'food';
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden="true" className="event-cover-art" data-kind={kind}>
      <rect width="400" height="400" fill={kind === 'movie' ? '#292e35' : kind === 'activity' ? '#e5ecd9' : '#f1e8d8'} />
      {kind === 'noodles' ? <>
        <circle cx="276" cy="118" r="120" fill="#dc4c35" />
        <ellipse cx="197" cy="307" rx="116" ry="15" fill="#b5a28b" opacity=".25" />
        <path d="M87 216C95 289 135 314 199 314C263 314 303 288 313 216H87Z" fill="#b53527" />
        <ellipse cx="200" cy="216" rx="113" ry="37" fill="#f9f3e8" />
        <ellipse cx="200" cy="216" rx="87" ry="24" fill="#d1b58b" />
        <path d="M151 216C127 189 183 195 173 171C162 148 139 150 147 123M189 220C223 190 173 178 201 154C229 130 201 121 213 99M231 217C258 195 217 181 240 160" stroke="#f9f3e8" strokeWidth="9" strokeLinecap="round" />
        <path d="M272 176L336 132M277 185L346 147" stroke="#292820" strokeWidth="6" strokeLinecap="round" />
      </> : kind === 'coffee' ? <>
        <circle cx="276" cy="118" r="120" fill="#dc4c35" />
        <ellipse cx="190" cy="307" rx="107" ry="16" fill="#b5a28b" opacity=".25" />
        <ellipse cx="190" cy="289" rx="107" ry="23" fill="#e2d3bb" />
        <path d="M265 177H283C321 177 323 237 282 237H262" stroke="#b53527" strokeWidth="18" />
        <path d="M103 169H273L261 248C257 278 122 278 117 248L103 169Z" fill="#b53527" />
        <ellipse cx="188" cy="169" rx="85" ry="23" fill="#f9f3e8" />
        <ellipse cx="188" cy="169" rx="67" ry="14" fill="#554333" />
        <path d="M166 129C151 106 186 103 174 82M207 129C192 106 226 103 214 82" stroke="#f9f3e8" strokeWidth="7" strokeLinecap="round" />
      </> : kind === 'food' ? <>
        <circle cx="276" cy="118" r="120" fill="#dc4c35" />
        <ellipse cx="188" cy="291" rx="117" ry="24" fill="#b5a28b" opacity=".25" />
        <ellipse cx="188" cy="233" rx="117" ry="65" fill="#f9f3e8" />
        <ellipse cx="188" cy="233" rx="85" ry="44" stroke="#d9c5a6" strokeWidth="2" />
        <path d="M156 231C154 211 170 204 181 209C187 190 213 195 216 211C243 207 250 239 231 249C221 272 175 263 170 250C151 255 142 237 156 231Z" fill="#b53527" />
        <path d="M304 181L293 282M291 157L287 190C286 205 306 207 309 192L314 160M301 159L297 195" stroke="#292820" strokeWidth="5" strokeLinecap="round" />
      </> : kind === 'movie' ? <>
        <circle cx="113" cy="118" r="100" fill="#d66a42" />
        <ellipse cx="208" cy="328" rx="100" ry="12" fill="#11161b" opacity=".35" />
        <path d="M143 112C143 95 157 82 175 82H240C257 82 270 95 270 112V239H143V112Z" fill="#f0e5d1" />
        <path d="M163 119C163 109 171 102 181 102H231C241 102 249 109 249 119V224H163V119Z" fill="#d66a42" />
        <rect x="132" y="225" width="150" height="43" rx="16" fill="#f0e5d1" />
        <path d="M129 203H116V266H145M284 203H298V266H269" stroke="#f0e5d1" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M164 268L154 319M251 268L261 319" stroke="#f0e5d1" strokeWidth="12" strokeLinecap="round" />
      </> : <>
        <circle cx="284" cy="118" r="108" fill="#aec497" />
        <ellipse cx="196" cy="320" rx="101" ry="13" fill="#405b4b" opacity=".17" />
        <path d="M158 213L134 290C129 307 144 317 161 317H238C255 317 269 306 264 290L240 213C224 225 177 225 158 213Z" fill="#233e49" />
        <path d="M148 203C148 186 172 178 199 178C226 178 250 186 250 203C250 222 225 235 199 235C172 235 148 222 148 203Z" fill="#3f6267" />
        <circle cx="199" cy="149" r="53" fill="#233e49" />
        <path d="M169 123C174 113 182 108 192 107" stroke="#779387" strokeWidth="6" strokeLinecap="round" />
      </>}
    </svg>
  );
}

/** One shared invitation design on the host and phone, including when Muse is offline. */
export function Poster({ plan, option, imageUrl, players }: { plan: Plan; option: Option | undefined; imageUrl?: string; players: Player[] }) {
  const [failedImage, setFailedImage] = useState<string>();
  // Old persisted posters contain model-rendered venue text. Keep those out of the new cover layout.
  const artUrl = plan.posterPrompt.startsWith('Art-only event cover:') && imageUrl !== failedImage ? imageUrl : undefined;
  return (
    <figure className="event-invitation">
      <div className="event-cover">
        {artUrl ? <img src={artUrl} alt="" className="event-cover-art" onError={() => setFailedImage(artUrl)} /> : <PlanCoverArt category={option?.category ?? ''} title={option?.title ?? ''} />}
      </div>
      <figcaption className="event-invitation-copy">
        <div className="event-invitation-eyebrow"><span>HEAR ME OUT</span><span>{option?.category ?? 'The plan'}</span></div>
        <h2 className="event-invitation-title">{option?.title ?? 'The plan'}</h2>
        <p className="event-invitation-time">{plan.slotLabel}</p>
        <div className="event-invitation-footer">
          <div className="event-invitation-people" role="group" aria-label={`Lobby: ${players.map(p => p.name).join(', ')}`}>
            {players.slice(0, 8).map(p => <span key={String(p.id)}><AvatarMark value={p.avatar} size={26} /></span>)}
          </div>
          <span className="event-invitation-credit">{artUrl ? 'Art by Muse Image' : 'Hear Me Out original art'}</span>
        </div>
      </figcaption>
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

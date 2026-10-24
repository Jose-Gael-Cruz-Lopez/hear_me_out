import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type Option, type Plan } from '@hmo/bindings';
import { DoodleIcon } from './DoodleIcon';
import { MUSE_CONNECTORS, museMemoryCount, reservationCode, reservationWhat } from '../lib/muse';
import { play } from '../lib/sound';

export function LiveDot() {
  return <span className="live-dot" aria-hidden="true" />;
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <motion.span className="inline-grid" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}>
      <DoodleIcon name="spark" size={size} />
    </motion.span>
  );
}

/** Home page: "Muse connected" pill that opens the list of connectors (simulated, see lib/muse.ts). */
export function MuseConnectedPill() {
  const { identity } = useSpacetimeDB();
  const dialog = useRef<HTMLDialogElement>(null);
  const count = museMemoryCount(identity?.toHexString() ?? '');
  return (
    <>
      <button className="cover-connected ink-pill" onClick={() => dialog.current?.showModal()}>
        <LiveDot /> Muse connected
        <span className="flex items-center gap-1 border-l border-[#14140f40] pl-2" role="img" aria-label={`${MUSE_CONNECTORS.length} connectors`}>
          {MUSE_CONNECTORS.slice(1).map(c => (
            <DoodleIcon key={c.name} name={c.icon} size={16} />
          ))}
        </span>
      </button>
      <dialog ref={dialog} className="ink-dialog" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
        <button type="button" className="dialog-close" aria-label="Close" onClick={() => dialog.current?.close()}><DoodleIcon name="cross" /></button>
        <div className="space-y-5 text-center">
          <DoodleIcon name="spark" size={48} />
          <h1 className="ink-heading text-4xl">Muse is connected</h1>
          <p className="text-cream/75">Muse already knows your taste, budget and free time, and books the place once your group decides.</p>
          <ul className="space-y-2 text-left">
            {MUSE_CONNECTORS.map(c => (
              <li key={c.name} className="flex items-center gap-3 rounded-2xl border border-[#14140f40] bg-white px-4 py-3">
                <DoodleIcon name={c.icon} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="font-black">{c.name}</div>
                  <div className="text-sm text-muted">{c.name === 'Meta Muse' ? `${count} memories synced` : c.detail}</div>
                </div>
                <span className="chip bg-lime text-cream"><DoodleIcon name="check" size={14} /> Connected</span>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}

const STEP_MS = [1400, 1700, 1500];

function savedStep(key: string): number {
  try {
    return sessionStorage.getItem(key) ? 3 : 0;
  } catch {
    return 0;
  }
}

/** Plan screen: Muse "books" the winning place (simulated, see lib/muse.ts; nothing is booked). Waits for `ready`. */
export function MuseReservation({ plan, option, category, party, ready, big = false }: { plan: Plan; option: Option; category: string; party: number; ready: boolean; big?: boolean }) {
  const mergedRoomId = plan.mergedWithRoomId;
  const [mergedRsvps] = useTable(tables.rsvp.where(r => r.roomId.eq(mergedRoomId)), { enabled: !!mergedRoomId });
  const totalParty = party + mergedRsvps.filter(r => r.status === 'yes').length;
  const key = `hmo-reserved:${plan.roomId}:${plan.id}:${plan.startAt.microsSinceUnixEpoch}:${encodeURIComponent(option.placeId)}:${encodeURIComponent(plan.slotLabel)}`;
  const [progress, setProgress] = useState(() => ({ key, step: savedStep(key) }));
  const step = progress.key === key ? progress.step : savedStep(key);
  useEffect(() => {
    if (!ready || step >= 3) return;
    const t = setTimeout(() => {
      if (step === 2) {
        play('ding');
        try {
          sessionStorage.setItem(key, '1');
        } catch {
          /* fine: it just replays */
        }
      }
      setProgress({ key, step: step + 1 });
    }, STEP_MS[step]);
    return () => clearTimeout(t);
  }, [ready, step, key]);

  const what = reservationWhat(category, totalParty);
  const What = what[0].toUpperCase() + what.slice(1);
  const lines = [`Contacting ${option.title}…`, `Requesting ${what} · ${plan.slotLabel}`, 'Holding it for the group…'];
  const title = big ? 'font-display text-3xl font-black' : 'font-display text-2xl font-black';

  if (!ready) {
    return (
      <div className="card flex items-center gap-3 p-5">
        <DoodleIcon name="ticket" size={28} />
        <div className="text-cream/80">Muse books {what.replace(/^a /, 'the ')} as soon as 3 people are in.</div>
      </div>
    );
  }
  if (step < 3) {
    return (
      <div className="card space-y-3 p-5">
        <div className={`flex items-center gap-3 ${title}`}>
          <Spinner size={big ? 28 : 22} /> Muse is booking it
        </div>
        <ul className={`space-y-1 ${big ? 'text-xl' : ''}`}>
          {lines.slice(0, step + 1).map((l, i) => (
            <motion.li key={l} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
              {i < step ? <DoodleIcon name="check" size={18} /> : <Spinner size={16} />}
              <span className={i < step ? 'text-cream/60' : ''}>{l}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }} className="card space-y-2 p-5 ring-4 ring-lime">
      <div className={`flex items-center gap-3 ${title}`}>
        <DoodleIcon name="check" size={big ? 30 : 24} /> Reserved
      </div>
      <div className={big ? 'text-2xl font-bold' : 'text-lg font-bold'}>
        {What} at {option.title}
      </div>
      <div className="text-cream/80">{plan.slotLabel}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="chip bg-ink-3 font-mono text-cream">Confirmation #{reservationCode(key)}</span>
        <span className="text-muted">Booked by Muse</span>
      </div>
    </motion.div>
  );
}

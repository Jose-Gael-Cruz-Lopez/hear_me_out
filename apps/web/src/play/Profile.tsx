import { IconText } from '../components/Ink';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { LiveDot, Spinner } from '../components/Muse';
import { museMemory, museMemoryCount } from '../lib/muse';
import { useCall, useRoom } from '../lib/room';
import { toast } from '../lib/toast';

const DIETS = ['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'dairy-free', 'nut-free', 'pescatarian'];
const TRAVEL = [10, 20, 30, 45];
const WINDOWS = [
  { label: '5–7pm', startMin: 17 * 60, endMin: 19 * 60 },
  { label: '7–9pm', startMin: 19 * 60, endMin: 21 * 60 },
  { label: '9–11pm', startMin: 21 * 60, endMin: 23 * 60 },
  { label: '11pm–late', startMin: 23 * 60, endMin: 26 * 60 },
];
const VIBES = ['Spicy', 'Cheap', 'Cozy', 'Loud', 'Board games', 'Night owl', 'Early bird', 'Outdoors', 'Live music', 'Dessert', 'Drinks', 'Adventurous'];
// Muse "pull" (simulated, see lib/muse.ts): each step ticks over after a short delay.
const PULL_STEPS = ['Connected to your Muse', 'Reading your memories', 'Checking your calendar for free time', 'Summarizing your taste and budget'];
const PULL_MS = [700, 1300, 1200, 1400];
const SOURCE_LABEL: Record<string, string> = { paste: 'your Muse', chips: 'your picks', basics: 'your basics', social: 'your posts' };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`chip px-4 py-2 text-base transition ${on ? 'bg-sun text-ink' : 'bg-ink-3 text-cream hover:bg-ink-4'}`}>
      {children}
    </button>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
}

/** Merge adjacent availability chips into windows (7–9 + 9–11 -> 7–11). */
function mergeWindows(labels: string[]) {
  const ws = WINDOWS.filter(w => labels.includes(w.label)).sort((a, b) => a.startMin - b.startMin);
  const out: { startMin: number; endMin: number }[] = [];
  for (const w of ws) {
    const last = out[out.length - 1];
    if (last && last.endMin === w.startMin) last.endMin = w.endMin;
    else out.push({ startMin: w.startMin, endMin: w.endMin });
  }
  return out;
}

export function ProfileFlow() {
  const { room, me, myDraft, profiles } = useRoom();
  const call = useCall();
  const [step, setStep] = useState<'basics' | 'muse'>('basics');
  const [budget, setBudget] = useState(2);
  const [diets, setDiets] = useState<string[]>([]);
  const [travel, setTravel] = useState(30);
  const [times, setTimes] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [pasted, setPasted] = useState('');
  const [platform, setPlatform] = useState<'instagram' | 'tiktok' | 'facebook'>('instagram');
  const [handle, setHandle] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editedTags, setEditedTags] = useState<string[] | null>(null);
  const [newTag, setNewTag] = useState('');
  const { identity } = useSpacetimeDB();
  const seed = identity?.toHexString() ?? '';
  const [pulled, setPulled] = useState(0);
  const pullDone = pulled >= PULL_STEPS.length;
  useEffect(() => {
    if (step !== 'muse' || pullDone) return;
    const t = setTimeout(() => setPulled(n => n + 1), PULL_MS[pulled]);
    return () => clearTimeout(t);
  }, [step, pulled, pullDone]);
  useEffect(() => {
    if (pullDone) setPasted(p => p || museMemory(seed));
  }, [pullDone, seed]);

  if (!me) return null;
  if (me.ready) {
    const tags = profiles.get(me.id)?.approvedTags ?? [];
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="text-7xl"><IconText text={"✅"} /></div>
        <div className="font-display text-3xl font-black">You're locked in</div>
        <div className="flex flex-wrap justify-center gap-2">
          {tags.map(t => (
            <span key={t} className="chip bg-sky/20 text-sky">
              #{t}
            </span>
          ))}
        </div>
        <div className="text-cream/70">Watch the TV while everyone else finishes.</div>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    await call(c =>
      c.reducers.submitProfile({
        roomId: room.id,
        budgetMax: budget,
        dietary: diets,
        maxTravelMin: travel,
        availability: mergeWindows(times),
        vibeChips: vibes,
        pastedContext: pasted,
        socialLinks: handle.trim() && consent ? [{ platform, handle: handle.trim() }] : [],
        consent: !!handle.trim() && consent,
      })
    );
    setEditedTags(null);
    setBusy(false);
  };

  // Step 3: approve the drafted tags (only after the AI has drafted them).
  if (myDraft && (myDraft.status === 'distilling' || myDraft.status === 'ready')) {
    if (myDraft.status === 'distilling') {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <motion.div className="text-7xl" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}><IconText text={" ✨ "} /></motion.div>
          <div className="font-display text-2xl font-black">Distilling your vibe…</div>
          {myDraft.socialLinks.length > 0 && <div className="text-cream/70">Reading your public posts with Apify. This can take up to a minute.</div>}
        </div>
      );
    }
    const tags = editedTags ?? myDraft.draftTags.map(t => t.tag);
    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="font-display text-sm font-black tracking-[0.25em] text-sun">STEP 3 OF 3</div>
          <div className="font-display text-3xl font-black">Approve your tags</div>
          <div className="mt-1 text-cream/75">Nobody sees these until you approve. Remove anything you don't want shared.</div>
        </div>
        <div className="chip self-start bg-lime/15 text-lime ring-1 ring-lime/40"><IconText text={"🔒 Only what you approve is shared. Private messages are never read."} /></div>
        {myDraft.note && <div className="text-sm text-muted">{myDraft.note}</div>}
        <div className="space-y-2">
          <AnimatePresence>
            {tags.map(tag => {
              const why = myDraft.draftTags.find(t => t.tag === tag);
              return (
                <motion.div key={tag} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="card flex items-center gap-3 p-3">
                  <div className="flex-1">
                    <div className="font-display text-xl font-black text-sky">#{tag}</div>
                    <div className="text-sm text-cream/70">{why ? `${why.reason} · from ${SOURCE_LABEL[why.source] ?? why.source}` : 'Added by you'}</div>
                  </div>
                  <button className="chip bg-ink-3 text-cream/80" onClick={() => setEditedTags(tags.filter(t => t !== tag))} aria-label={`Remove ${tag}`}><IconText text={" ✕ "} /></button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {tags.length === 0 && <div className="text-cream/60">No tags. That's allowed: you'll still play.</div>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            const t = newTag.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (!t || tags.includes(t)) return;
            if (tags.length >= 8) return toast('8 tags max');
            setEditedTags([...tags, t]);
            setNewTag('');
          }}
        >
          <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Add a tag" className="min-w-0 flex-1 rounded-2xl bg-ink px-4 py-3 ring-2 ring-white/10 outline-none focus:ring-sky" />
          <button className="btn btn-ghost text-base">Add</button>
        </form>
        <div className="flex gap-3">
          <button className="btn btn-lime flex-1" onClick={() => call(c => c.reducers.approveTags({ roomId: room.id, tags }))}>
            Approve & share
          </button>
          <button className="btn btn-ghost text-base" onClick={() => void submit()}>
            Redo
          </button>
        </div>
      </div>
    );
  }

  if (step === 'basics') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="font-display text-sm font-black tracking-[0.25em] text-sun">STEP 1 OF 3</div>
          <div className="font-display text-3xl font-black">The basics</div>
          <div className="text-cream/75">Shared with the group so the plan works for you.</div>
        </div>
        <section className="space-y-2">
          <div className="font-bold">Budget tonight</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(b => (
              <Chip key={b} on={budget === b} onClick={() => setBudget(b)}>
                {'$'.repeat(b)}
              </Chip>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <div className="font-bold">Dietary needs</div>
          <div className="flex flex-wrap gap-2">
            {DIETS.map(d => (
              <Chip key={d} on={diets.includes(d)} onClick={() => setDiets(toggle(diets, d))}>
                {d}
              </Chip>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <div className="font-bold">Max travel</div>
          <div className="flex gap-2">
            {TRAVEL.map(t => (
              <Chip key={t} on={travel === t} onClick={() => setTravel(t)}>
                {t} min
              </Chip>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <div className="font-bold">Free tonight</div>
          <div className="flex flex-wrap gap-2">
            {WINDOWS.map(w => (
              <Chip key={w.label} on={times.includes(w.label)} onClick={() => setTimes(toggle(times, w.label))}>
                {w.label}
              </Chip>
            ))}
            <Chip on={times.length === 0} onClick={() => setTimes([])}>
              whenever
            </Chip>
          </div>
        </section>
        <section className="space-y-2">
          <div className="font-bold">Your vibe</div>
          <div className="flex flex-wrap gap-2">
            {VIBES.map(v => (
              <Chip key={v} on={vibes.includes(v)} onClick={() => setVibes(toggle(vibes, v))}>
                {v}
              </Chip>
            ))}
          </div>
        </section>
        <button className="btn btn-pop" onClick={() => setStep('muse')}>
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="font-display text-sm font-black tracking-[0.25em] text-sun">STEP 2 OF 3</div>
        <div className="font-display text-3xl font-black">Your Muse</div>
        <div className="text-cream/75">Muse is connected. It's pulling what it already knows about you.</div>
      </div>
      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2 font-bold">
          <LiveDot /> Meta Muse · Connected
        </div>
        <ul className="space-y-1">
          {PULL_STEPS.map((label, i) =>
            i > pulled ? null : (
              <motion.li key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
                {i < pulled ? <IconText text="✓" /> : <Spinner size={16} />}
                <span className={i < pulled ? 'text-cream/60' : ''}>{label}{i < pulled ? '' : '…'}</span>
              </motion.li>
            )
          )}
        </ul>
        {pullDone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <div className="text-sm font-bold text-muted">Found {museMemoryCount(seed)} memories. Here's what Muse knows (fix anything that's off):</div>
            <textarea
              value={pasted}
              onChange={e => setPasted(e.target.value.slice(0, 2000))}
              rows={5}
              className="w-full rounded-2xl bg-ink p-3 ring-2 ring-white/10 outline-none focus:ring-sky"
            />
          </motion.div>
        )}
      </div>
      <div className="card space-y-3 p-4">
        <div className="font-bold">Link your own public account (optional)</div>
        <div className="text-sm text-cream/70">We read your recent public posts to suggest tags, then throw the posts away. You still approve every tag.</div>
        <div className="flex gap-2">
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value as typeof platform)}
            className="rounded-2xl bg-ink px-3 py-3 ring-2 ring-white/10 outline-none focus:ring-sky"
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook page</option>
          </select>
          <input
            value={handle}
            onChange={e => setHandle(e.target.value.slice(0, 80))}
            placeholder={platform === 'facebook' ? 'facebook.com/yourpage' : '@yourhandle'}
            className="min-w-0 flex-1 rounded-2xl bg-ink px-4 py-3 ring-2 ring-white/10 outline-none focus:ring-sky"
          />
        </div>
        {handle.trim() && (
          <label className="flex items-start gap-2 text-sm font-bold">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#a3ff5c]" />
            This is my account and I consent to it being read for this game.
          </label>
        )}
      </div>
      <div className="flex gap-3">
        <button className="btn btn-ghost text-base" onClick={() => setStep('basics')}>
          Back
        </button>
        <button className="btn btn-pop flex-1" disabled={busy || !pullDone || (!!handle.trim() && !consent)} onClick={() => void submit()}><IconText text={pullDone ? " ✨ Distill my vibe " : "Muse is reading…"} /></button>
      </div>
    </div>
  );
}

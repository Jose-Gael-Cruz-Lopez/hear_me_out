import { IconText } from '../components/Ink';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { LiveDot, Spinner } from '../components/Muse';
import { museMemory, museMemoryCount } from '../lib/muse';
import { useCall, useRoom } from '../lib/room';
import { toast } from '../lib/toast';
import { MHead, MScreen } from '../components/Mobile';

const DIETS = ['vegan', 'vegetarian', 'gluten-free', 'halal', 'kosher', 'dairy-free', 'nut-free', 'pescatarian'];
const TRAVEL = [10, 20, 30, 45];
const WINDOWS = [
  { label: '5–7pm', startMin: 17 * 60, endMin: 19 * 60 },
  { label: '7–9pm', startMin: 19 * 60, endMin: 21 * 60 },
  { label: '9–11pm', startMin: 21 * 60, endMin: 23 * 60 },
  { label: '11pm–late', startMin: 23 * 60, endMin: 26 * 60 },
];
const VIBES = ['Spicy', 'Cheap', 'Cozy', 'Loud', 'Board games', 'Night owl', 'Early bird', 'Outdoors', 'Live music', 'Dessert', 'Drinks', 'Adventurous'];
// Simulated Muse pull, shown without labels (DECISIONS.md #40; see lib/muse.ts). No account is read.
const PULL_STEPS = ['Connected to your Muse', 'Reading your memories', 'Checking your calendar for free time', 'Summarizing your taste and budget'];
// ~13 s in all, so the pull reads like Muse is really fetching.
const PULL_MS = [2000, 4000, 3500, 3500];
const SOURCE_LABEL: Record<string, string> = { paste: 'your Muse', chips: 'your picks', basics: 'your basics', social: 'your posts' };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`m-toggle ${on ? 'on' : ''}`}>
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
  const [approving, setApproving] = useState(false);
  const submittingRef = useRef(false);
  const approvingRef = useRef(false);
  const [editedTags, setEditedTags] = useState<string[] | null>(null);
  const [newTag, setNewTag] = useState('');
  const { identity } = useSpacetimeDB();
  const seed = identity?.toHexString() ?? '';
  const [pulled, setPulled] = useState(0);
  const pullDone = pulled >= PULL_STEPS.length;
  useEffect(() => {
    if (step !== 'muse' || pullDone) return;
    const t = setTimeout(() => {
      const next = pulled + 1;
      setPulled(next);
      if (next === PULL_STEPS.length) setPasted(p => p || museMemory(seed));
    }, PULL_MS[pulled]);
    return () => clearTimeout(t);
  }, [step, pulled, pullDone, seed]);

  if (!me) return null;
  if (me.ready) {
    const tags = profiles.get(me.id)?.approvedTags ?? [];
    return (
      <MScreen center>
        <IconText text={"✅"} size={64} />
        <h1 className="m-h1 m-center-text">You're locked in</h1>
        <div className="m-tagcloud">
          {tags.map(t => (
            <span key={t}>#{t}</span>
          ))}
        </div>
        <p className="m-sub m-center-text">Watch the TV while everyone else finishes.</p>
      </MScreen>
    );
  }

  const submit = async (useSavedInputs = false) => {
    if (submittingRef.current || approvingRef.current || !pullDone) return;
    const savedProfile = profiles.get(me.id);
    if (useSavedInputs && (!myDraft || !savedProfile)) return;
    // Redo means distill the same submitted inputs again. After a reload the local
    // form contains defaults, while the server still has the original constraints
    // and private context. Use those saved inputs without overwriting fresh edits.
    const inputs = useSavedInputs && myDraft && savedProfile
      ? {
          budgetMax: savedProfile.budgetMax,
          dietary: savedProfile.dietary,
          maxTravelMin: savedProfile.maxTravelMin,
          availability: savedProfile.availability,
          vibeChips: myDraft.vibeChips,
          pastedContext: myDraft.pastedContext,
          socialLinks: myDraft.socialLinks,
          consent: myDraft.consent,
        }
      : {
          budgetMax: budget,
          dietary: diets,
          maxTravelMin: travel,
          availability: mergeWindows(times),
          vibeChips: vibes,
          pastedContext: pasted,
          socialLinks: handle.trim() && consent ? [{ platform, handle: handle.trim() }] : [],
          consent: !!handle.trim() && consent,
        };
    submittingRef.current = true;
    setBusy(true);
    try {
      const ok = await call(c => c.reducers.submitProfile({ roomId: room.id, ...inputs }));
      if (ok) setEditedTags(null);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  // Step 3: approve the drafted tags (only after the AI has drafted them).
  if (myDraft && (myDraft.status === 'distilling' || myDraft.status === 'ready')) {
    if (myDraft.status === 'distilling') {
      return (
        <MScreen center>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}><IconText text={"✨"} size={64} /></motion.div>
          <h1 className="m-h1 m-center-text">Distilling your vibe…</h1>
          {myDraft.socialLinks.length > 0 && <p className="m-sub m-center-text">Reading your public posts with Apify. This can take up to a minute.</p>}
        </MScreen>
      );
    }
    const tags = editedTags ?? myDraft.draftTags.map(t => t.tag);
    const approve = async () => {
      if (submittingRef.current || approvingRef.current) return;
      approvingRef.current = true;
      setApproving(true);
      try {
        await call(c => c.reducers.approveTags({ roomId: room.id, tags }));
      } finally {
        approvingRef.current = false;
        setApproving(false);
      }
    };
    return (
      <MScreen
        action={
          <>
            <button className="m-btn m-btn-ok" disabled={busy || approving} onClick={() => void approve()}>
              {approving ? 'Sharing…' : 'Approve & share'}
            </button>
            <button className="m-btn m-btn-alt" disabled={busy || approving || !profiles.has(me.id)} onClick={() => void submit(true)}>
              Redo
            </button>
          </>
        }
      >
        <MHead kicker="STEP 3 OF 3" title="Approve your tags" sub="Nobody sees these until you approve." />
        <div className="m-private"><IconText text={"🔒 Private messages are never read"} /></div>
        {myDraft.note && <div className="m-small m-dim">{myDraft.note}</div>}
        <div className="m-card m-tags">
          <AnimatePresence>
            {tags.map(tag => {
              const why = myDraft.draftTags.find(t => t.tag === tag);
              return (
                <motion.div key={tag} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="m-tag-row">
                  <div className="m-tag-text">
                    <div className="m-tag">#{tag}</div>
                    <div className="m-tag-why">{why ? `${why.reason} · from ${SOURCE_LABEL[why.source] ?? why.source}` : 'Added by you'}</div>
                  </div>
                  <button className="m-x" disabled={busy || approving} onClick={() => setEditedTags(tags.filter(t => t !== tag))} aria-label={`Remove ${tag}`}><IconText text={"✕"} /></button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {tags.length === 0 && <div className="m-tag-empty">No tags. That's allowed: you'll still play.</div>}
        </div>
        <form
          className="m-add"
          onSubmit={e => {
            e.preventDefault();
            if (submittingRef.current || approvingRef.current) return;
            const t = newTag.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (!t || tags.includes(t)) return;
            if (tags.length >= 8) return toast('8 tags max');
            setEditedTags([...tags, t]);
            setNewTag('');
          }}
        >
          <input value={newTag} disabled={busy || approving} onChange={e => setNewTag(e.target.value)} placeholder="Add a tag" className="m-input" />
          <button className="m-add-btn" disabled={busy || approving}>Add</button>
        </form>
      </MScreen>
    );
  }

  if (step === 'basics') {
    return (
      <MScreen action={<button className="m-btn" onClick={() => setStep('muse')}>Next</button>}>
        <MHead kicker="STEP 1 OF 3" title="The basics" sub="Shared with the group so the plan works for you." />
        <section className="m-field-group">
          <div className="m-q">Budget tonight</div>
          <div className="m-seg" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {[1, 2, 3, 4].map(b => (
              <button key={b} type="button" className={budget === b ? 'on' : ''} onClick={() => setBudget(b)}>
                {'$'.repeat(b)}
              </button>
            ))}
          </div>
        </section>
        <section className="m-field-group">
          <div className="m-q">Max travel</div>
          <div className="m-seg" style={{ gridTemplateColumns: `repeat(${TRAVEL.length}, minmax(0, 1fr))` }}>
            {TRAVEL.map(t => (
              <button key={t} type="button" className={travel === t ? 'on' : ''} onClick={() => setTravel(t)}>
                {t} min
              </button>
            ))}
          </div>
        </section>
        <section className="m-field-group">
          <div className="m-q">Free tonight</div>
          <div className="m-chips">
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
        <section className="m-field-group">
          <div className="m-q">Your vibe</div>
          <div className="m-chips">
            {VIBES.map(v => (
              <Chip key={v} on={vibes.includes(v)} onClick={() => setVibes(toggle(vibes, v))}>
                {v}
              </Chip>
            ))}
          </div>
        </section>
        <details className="m-collapse">
          <summary>
            <span>
              Dietary needs <span className="m-dim">· {diets.length ? diets.join(', ') : 'none'}</span>
            </span>
            <span className="m-case-sign" aria-hidden="true" />
          </summary>
          <div className="m-chips m-collapse-body">
            {DIETS.map(d => (
              <Chip key={d} on={diets.includes(d)} onClick={() => setDiets(toggle(diets, d))}>
                {d}
              </Chip>
            ))}
          </div>
        </details>
      </MScreen>
    );
  }

  return (
    <MScreen
      action={
        <>
          <button className="m-btn m-btn-alt" onClick={() => setStep('basics')}>
            Back
          </button>
          <button className="m-btn" disabled={busy || !pullDone || (!!handle.trim() && !consent)} onClick={() => void submit()}><IconText text={pullDone ? " ✨ Distill my vibe " : "Muse is reading…"} /></button>
        </>
      }
    >
      <MHead kicker="STEP 2 OF 3" title="Your Muse" sub="Muse is connected. It's pulling what it already knows about you." />
      <div className="m-card m-card-pad m-stack-sm" role="status" aria-live="polite">
        <div className="flex items-center gap-2 font-bold">
          <LiveDot /> Meta Muse · Connected
        </div>
        <ul className="space-y-1">
          {PULL_STEPS.slice(0, pulled + 1).map((label, i) => (
            <motion.li key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm">
              {i < pulled ? <IconText text="✓" /> : <Spinner size={16} />}
              <span className={i < pulled ? 'text-cream/60' : ''}>{label}{i < pulled ? '' : '…'}</span>
            </motion.li>
          ))}
        </ul>
        {pullDone && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            <div className="text-sm font-bold text-muted">Found {museMemoryCount(seed)} memories. Here's what Muse knows (fix anything that's off):</div>
            <textarea
              value={pasted}
              onChange={e => setPasted(e.target.value.slice(0, 2000))}
              rows={5}
              aria-label="What Muse knows about you"
              className="m-textarea m-type"
            />
          </motion.div>
        )}
      </div>
      <div className="m-card m-card-pad m-stack-sm">
        <div className="font-bold">Link your own public account (optional)</div>
        <div className="text-sm text-cream/70">We read your recent public posts to suggest tags, then throw the posts away. You still approve every tag.</div>
        <div className="flex gap-2">
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value as typeof platform)}
            className="m-select"
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook page</option>
          </select>
          <input
            value={handle}
            onChange={e => setHandle(e.target.value.slice(0, 80))}
            placeholder={platform === 'facebook' ? 'facebook.com/yourpage' : '@yourhandle'}
            className="m-input"
          />
        </div>
        {handle.trim() && (
          <label className="flex items-start gap-2 text-sm font-bold">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#a3ff5c]" />
            This is my account and I consent to it being read for this game.
          </label>
        )}
      </div>
    </MScreen>
  );
}

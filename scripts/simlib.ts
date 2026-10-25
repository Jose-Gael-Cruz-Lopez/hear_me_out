// Shared helpers for the simulators.
import { DbConnection, tables } from '@hmo/bindings';

export const URI = process.env.SPACETIMEDB_URI || 'ws://127.0.0.1:3000';
export const DB = process.env.SPACETIMEDB_DB_NAME || 'hear-me-out';
export const VERBOSE = process.argv.includes('--verbose');

const started = Date.now();
export const t = () => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`;
export const checks: { ok: boolean; label: string }[] = [];

export function check(ok: boolean, label: string): void {
  checks.push({ ok, label });
  console.log(`${t()}  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

export function finish(): never {
  const failed = checks.filter(c => !c.ok);
  console.log(`\n${failed.length === 0 ? '✅ sim passed' : `❌ ${failed.length} check(s) failed`} — ${checks.length} checks in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(failed.length === 0 ? 0 : 1);
}

export function connect(label: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .onConnect(conn => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve(conn))
          .subscribe([
            tables.room,
            tables.player,
            tables.profilePublic,
            tables.option,
            tables.assignment,
            tables.pitch,
            tables.warmup,
            tables.vote,
            tables.award,
            tables.plan,
            tables.rsvp,
            tables.objection,
            tables.mergeOffer,
            tables.mergeVote,
            tables.myProfileDraft,
            tables.myPrevote,
            tables.myLean,
            tables.roomSway,
            tables.menuProof,
            tables.myLobbyMatches,
            tables.myGroupChat,
            tables.adminJobs,
          ]);
      })
      .onConnectError((_ctx, err) => reject(new Error(`${label}: ${err}`)))
      .build();
  });
}

export async function waitFor<T>(label: string, fn: () => T | undefined | null | false, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 40));
  }
}

export const quiet = <T>(p: Promise<T>) => p.catch(err => (VERBOSE ? console.log(`${t()}  (expected) ${String(err).slice(0, 120)}`) : undefined));

export async function rejects(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    return String(err instanceof Error ? err.message : err);
  }
}

/** A short mono 16 kHz sine-wave WAV, standing in for a recorded pitch. */
export function sineWav(seconds: number): Uint8Array {
  const rate = 16000;
  const n = Math.floor(rate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, x: string) => [...x].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), true);
  return new Uint8Array(buf);
}

/** Scripted player: acts on whatever phase its room is in. Returns a stop function. */
export function autopilot(
  conn: DbConnection,
  name: string,
  roomId: () => bigint,
  opts: {
    pickVote?: (options: { id: bigint; placeId: string; sortOrder: number }[]) => bigint | undefined;
    rsvp?: 'yes' | 'no';
    mergeYes?: boolean;
    /** Upload this recording instead of typing a pitch. */
    pitchAudio?: { bytes: Uint8Array; mime: string; durationMs: number };
  } = {}
): () => void {
  const done = new Set<string>();
  const once = (key: string, fn: () => Promise<unknown>) => {
    if (done.has(key)) return;
    done.add(key);
    void quiet(fn());
  };
  const id = setInterval(() => {
    const r = conn.db.room.id.find(roomId());
    if (!r) return;
    const me = [...conn.db.player.iter()].find(p => p.roomId === r.id && p.name === name);
    if (!me) return;
    const k = `${r.phaseSeq}`;
    const options = [...conn.db.option.iter()].filter(o => o.roomId === r.id).sort((a, b) => a.sortOrder - b.sortOrder);
    switch (r.phase) {
      case 'finalists':
      case 'assignments':
      case 'playback':
      case 'results':
        once(`ready${k}`, () => conn.reducers.acknowledgePhase({ roomId: r.id, phaseSeq: r.phaseSeq }));
        break;
      case 'profiles': {
        once('profile', () =>
          conn.reducers.submitProfile({
            roomId: r.id,
            budgetMax: 2,
            dietary: [],
            maxTravelMin: 30,
            availability: [{ startMin: 18 * 60, endMin: 23 * 60 }],
            vibeChips: ['Board games', 'Spicy'],
            pastedContext: 'Into board games, spicy food and ramen.',
            socialLinks: [],
            consent: false,
          })
        );
        const draft = [...conn.db.myProfileDraft.iter()].find(dr => dr.playerId === me.id);
        if (draft?.status === 'ready') once('approve', () => conn.reducers.approveTags({ roomId: r.id, tags: draft.draftTags.map(x => x.tag) }));
        break;
      }
      case 'warmup': {
        const w = [...conn.db.warmup.iter()].find(x => x.playerId === me.id && x.roomId === r.id);
        if (w && !w.answer) once(`w${k}`, () => conn.reducers.answerWarmup({ warmupId: w.id, answer: 'b' }));
        break;
      }
      case 'prevote':
        if (options[0]) once(`p${k}`, () => conn.reducers.castPrevote({ roomId: r.id, optionId: options[0].id }));
        break;
      case 'pitching': {
        const mine = [...conn.db.pitch.iter()].find(p => p.roomId === r.id && p.playerId === me.id);
        if (mine && opts.pitchAudio) {
          const a = opts.pitchAudio;
          once(`pi${k}`, () => conn.reducers.uploadPitchAudio({ pitchId: mine.id, mime: a.mime, bytes: a.bytes, durationMs: a.durationMs, browserTranscript: '' }));
        } else if (mine) once(`pi${k}`, () => conn.reducers.submitTypedPitch({ pitchId: mine.id, text: `I am ${name} and this place is five stars and open until 2am. Trust me!` }));
        break;
      }
      case 'vote': {
        const pick = opts.pickVote?.(options) ?? options[0]?.id;
        if (pick !== undefined) once(`v${k}`, () => conn.reducers.castVote({ roomId: r.id, optionId: pick }));
        break;
      }
      case 'plan': {
        const plan = [...conn.db.plan.iter()].find(p => p.roomId === r.id);
        if (plan && opts.rsvp) once('rsvp', () => conn.reducers.setRsvp({ planId: plan.id, status: opts.rsvp! }));
        const offer = [...conn.db.mergeOffer.iter()].find(o => (o.roomA === r.id || o.roomB === r.id) && o.status === 'open');
        if (offer && opts.mergeYes !== undefined) once(`m${offer.id}`, () => conn.reducers.voteMerge({ offerId: offer.id, yes: opts.mergeYes! }));
        break;
      }
    }
  }, 30);
  return () => clearInterval(id);
}

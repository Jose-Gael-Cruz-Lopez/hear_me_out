import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useCall, useRoom } from '../lib/room';
import { play } from '../lib/sound';
import { toast } from '../lib/toast';
import { BriefCard } from './phases';

const MAX_MS = 30_000;

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

function makeRecognizer(): SpeechRec | null {
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  return r;
}

function pickMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function Recorder() {
  const { me, pitches, room } = useRoom();
  const call = useCall();
  const mine = pitches.find(p => p.playerId === me?.id);
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'sending'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [captions, setCaptions] = useState('');
  const [redosLeft, setRedosLeft] = useState(1);
  const [typing, setTyping] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const speech = useRef<SpeechRec | null>(null);
  const startedAt = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 100);
    return () => clearInterval(id);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!mine || !me) return <div className="text-center text-xl">Getting your case ready…</div>;

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 });
      chunks.current = [];
      rec.ondataavailable = e => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || mime || 'audio/webm' });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setState('review');
      };
      recRef.current = rec;
      rec.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setCaptions('');
      setState('recording');
      play('pop');
      // Live captions from the browser's own speech recognition (Chrome). Used only as a labeled fallback.
      const sr = makeRecognizer();
      if (sr) {
        sr.onresult = e => {
          let text = '';
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          setCaptions(text.trim());
        };
        sr.onerror = () => undefined;
        try {
          sr.start();
          speech.current = sr;
        } catch {
          speech.current = null;
        }
      }
    } catch {
      toast('No microphone access. Type your pitch instead.');
      setTyping(true);
    }
  };

  function stop() {
    durationRef.current = Math.min(MAX_MS, Date.now() - startedAt.current);
    speech.current?.stop();
    speech.current = null;
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }

  const send = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setState('sending');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ok = await call(c =>
      c.reducers.uploadPitchAudio({ pitchId: mine.id, mime: blob.type.split(';')[0] || 'audio/webm', bytes, durationMs: durationRef.current, browserTranscript: captions })
    );
    if (!ok) setState('review');
  };

  const sendTyped = async (text: string) => {
    await call(c => c.reducers.submitTypedPitch({ pitchId: mine.id, text }));
  };

  // After upload: show status, and offer typing if transcription failed.
  if (mine.status !== 'waiting') {
    return (
      <div className="flex flex-col gap-5">
        <BriefCard />
        {mine.status === 'needs_text' ? (
          <TypeBox initial={mine.liveCaption} onSend={sendTyped} title="We couldn't transcribe that. Type your pitch instead:" />
        ) : (
          <div className="card space-y-3 p-6 text-center">
            <div className="text-6xl"><IconText text={mine.status === 'ready' ? '✅' : '📝'} /></div>
            <div className="font-display text-2xl font-black">{mine.status === 'ready' ? 'Pitch submitted!' : 'Transcribing…'}</div>
            {mine.transcript && <div className="text-cream/80 italic">“{mine.transcript}”</div>}
            <div className="text-sm text-muted">Get ready to hear everyone out on the TV.</div>
          </div>
        )}
      </div>
    );
  }

  if (typing) {
    return (
      <div className="flex flex-col gap-5">
        <BriefCard />
        <TypeBox initial={captions} onSend={sendTyped} title="Type your pitch (everyone can follow it during playback):" />
        <button className="btn btn-ghost text-base" onClick={() => setTyping(false)}><IconText text={" 🎙️ Record instead "} /></button>
      </div>
    );
  }

  const frac = Math.min(1, elapsed / MAX_MS);
  const R = 88;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col gap-5">
      <BriefCard />
      <div className="flex flex-col items-center gap-4">
        {state !== 'review' && state !== 'sending' && (
          <button
            onClick={() => (state === 'recording' ? stop() : void start())}
            className="relative grid h-52 w-52 place-items-center rounded-full"
            aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            <svg width={200} height={200} className="absolute -rotate-90">
              <circle cx={100} cy={100} r={R} stroke="rgb(255 255 255 / 0.12)" strokeWidth={10} fill="none" />
              <circle cx={100} cy={100} r={R} stroke="#ff3e8a" strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
            </svg>
            <motion.div
              animate={state === 'recording' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={{ repeat: Infinity, duration: 1 }}
              className={`grid h-36 w-36 place-items-center rounded-full font-display text-xl font-black shadow-[0_8px_0_rgb(0_0_0/0.35)] ${state === 'recording' ? 'bg-sustain text-white' : 'bg-pop text-white'}`}
            >
              <IconText text={state === 'recording' ? `${Math.ceil((MAX_MS - elapsed) / 1000)}s · stop` : '🎙️ Record'} />
            </motion.div>
          </button>
        )}
        {state === 'recording' && captions && (
          <div className="card w-full p-4 text-cream/85">
            <div className="text-xs font-bold text-muted">Live captions by your browser</div>
            {captions}
          </div>
        )}
        {(state === 'review' || state === 'sending') && (
          <div className="card w-full space-y-4 p-5">
            <div className="font-display text-xl font-black">How did that sound?</div>
            {previewUrl && <audio src={previewUrl} controls className="w-full" />}
            {captions && <div className="text-sm text-cream/70 italic">“{captions}”</div>}
            <div className="flex gap-3">
              <button className="btn btn-lime flex-1" disabled={state === 'sending'} onClick={() => void send()}>
                {state === 'sending' ? 'Sending…' : 'Send it'}
              </button>
              <button
                className="btn btn-ghost text-base"
                disabled={redosLeft === 0 || state === 'sending'}
                onClick={() => {
                  setRedosLeft(r => r - 1);
                  setState('idle');
                }}
              >
                Redo ({redosLeft})
              </button>
            </div>
          </div>
        )}
        <button className="text-sm font-bold text-muted underline" onClick={() => setTyping(true)}>
          No mic? Type your pitch instead
        </button>
        {room.fastMode && <div className="text-xs text-muted">fast mode</div>}
      </div>
    </div>
  );
}

function TypeBox({ initial, onSend, title }: { initial: string; onSend: (text: string) => Promise<void>; title: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        await onSend(text);
        setBusy(false);
      }}
    >
      <div className="font-bold">{title}</div>
      <textarea value={text} onChange={e => setText(e.target.value.slice(0, 800))} rows={6} className="w-full rounded-2xl bg-ink p-3 text-lg ring-2 ring-white/10 outline-none focus:ring-sky" placeholder="Ladies and gentlemen of the jury…" />
      <button className="btn btn-lime w-full" disabled={busy || text.trim().length < 3}>
        Submit pitch
      </button>
    </form>
  );
}

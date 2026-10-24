import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isMatchedRoom, useCall, useRoom } from '../lib/room';
import { play } from '../lib/sound';
import { toast } from '../lib/toast';
import { CaseToggle } from './phases';
import { MScreen } from '../components/Mobile';

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
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const captureRequest = useRef(0);

  // Discarding a take (or leaving this screen) must also release the actual mic.
  // Invalidate pending permission requests so a late grant cannot restart capture.
  const discardCapture = useCallback(() => {
    captureRequest.current += 1;
    const recognizer = speech.current;
    speech.current = null;
    try { recognizer?.stop(); } catch { /* Already stopped. */ }
    const recorder = recRef.current;
    recRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* Tracks are still released below. */ }
      }
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discardCapture();
    };
  }, [discardCapture]);

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
    discardCapture();
    const request = captureRequest.current;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current || request !== captureRequest.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 });
      const recordingStream = stream;
      chunks.current = [];
      rec.ondataavailable = e => {
        if (mounted.current && request === captureRequest.current && e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        recordingStream.getTracks().forEach(track => track.stop());
        if (streamRef.current === recordingStream) streamRef.current = null;
        if (recRef.current === rec) recRef.current = null;
        if (!mounted.current || request !== captureRequest.current) return;
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
          if (!mounted.current || request !== captureRequest.current) return;
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
      stream?.getTracks().forEach(track => track.stop());
      if (!mounted.current || request !== captureRequest.current) return;
      discardCapture();
      toast('No microphone access. Type your pitch instead.');
      setState('idle');
      setTyping(true);
    }
  };

  function stop() {
    durationRef.current = Math.min(MAX_MS, Date.now() - startedAt.current);
    try { speech.current?.stop(); } catch { /* Already stopped. */ }
    speech.current = null;
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }

  const send = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setState('sending');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!mounted.current) return;
    const ok = await call(c =>
      c.reducers.uploadPitchAudio({ pitchId: mine.id, mime: blob.type.split(';')[0] || 'audio/webm', bytes, durationMs: durationRef.current, browserTranscript: captions })
    );
    if (!ok && mounted.current) setState('review');
  };

  const sendTyped = async (text: string) => {
    await call(c => c.reducers.submitTypedPitch({ pitchId: mine.id, text }));
  };

  // After upload: show status, and offer typing if transcription failed.
  if (mine.status !== 'waiting') {
    return (
      <MScreen>
        <CaseToggle />
        {mine.status === 'needs_text' ? (
          <TypeBox initial={mine.liveCaption} onSend={sendTyped} title="We couldn't transcribe that. Type your pitch instead:" />
        ) : (
          <div className="m-card m-card-pad m-done">
            <div className="m-done-icon"><IconText text={mine.status === 'ready' ? '✅' : '📝'} size={44} /></div>
            <div className="m-h1">{mine.status === 'ready' ? 'Pitch submitted!' : 'Transcribing…'}</div>
            {mine.transcript && <div className="m-review-caption">“{mine.transcript}”</div>}
            <div className="m-sub">{isMatchedRoom(room) ? 'Everyone’s pitch will play here on your phone.' : 'Get ready to hear everyone out on the TV.'}</div>
          </div>
        )}
      </MScreen>
    );
  }

  if (typing) {
    return (
      <MScreen>
        <CaseToggle />
        <TypeBox initial={captions} onSend={sendTyped} title="Type your pitch (everyone can follow it during playback):" />
        <button className="m-link" onClick={() => setTyping(false)}><IconText text={" 🎙️ Record instead "} /></button>
      </MScreen>
    );
  }

  const frac = Math.min(1, elapsed / MAX_MS);
  const R = 88;
  const C = 2 * Math.PI * R;

  const reviewing = state === 'review' || state === 'sending';
  return (
    <MScreen
      action={
        reviewing && (
          <>
            <button className="m-btn m-btn-ok" disabled={state === 'sending'} onClick={() => void send()}>
              {state === 'sending' ? 'Sending…' : 'Send it'}
            </button>
            <button
              className="m-btn m-btn-alt"
              disabled={redosLeft === 0 || state === 'sending'}
              onClick={() => {
                setRedosLeft(r => r - 1);
                setState('idle');
              }}
            >
              Redo ({redosLeft})
            </button>
          </>
        )
      }
    >
      <CaseToggle />
      <div className="m-rec">
        {state !== 'review' && state !== 'sending' && (
          <button
            onClick={() => (state === 'recording' ? stop() : void start())}
            className="relative grid h-52 w-52 place-items-center rounded-full"
            aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            <svg width={200} height={200} className="absolute -rotate-90">
              <circle cx={100} cy={100} r={R} stroke="#d7d6ce" strokeWidth={10} fill="none" />
              <circle cx={100} cy={100} r={R} stroke="#b42c24" strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
            </svg>
            <motion.div
              animate={state === 'recording' ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              transition={{ repeat: Infinity, duration: 1 }}
              className={`m-rec-btn ${state === 'recording' ? 'on' : ''}`}
            >
              <IconText text={state === 'recording' ? `${Math.ceil((MAX_MS - elapsed) / 1000)}s · stop` : '🎙️ Record'} />
            </motion.div>
          </button>
        )}
        {state === 'idle' && <div className="m-rec-hint">Tap to record up to {Math.round(MAX_MS / 1000)} seconds</div>}
        {state === 'recording' && captions && (
          <div className="m-card m-card-pad m-full">
            <div className="m-label m-dim">LIVE CAPTIONS</div>
            <div className="m-caption">{captions}</div>
          </div>
        )}
        {reviewing && (
          <div className="m-card m-card-pad m-full m-stack-sm">
            <div className="m-card-title m-big">How did that sound?</div>
            {previewUrl && <audio src={previewUrl} controls className="w-full" />}
            {captions && <div className="m-review-caption">“{captions}”</div>}
          </div>
        )}
        <button className="m-link" onClick={() => {
          discardCapture();
          if (state === 'recording') setState('idle');
          setTyping(true);
        }}>
          No mic? Type your pitch instead
        </button>
        {room.fastMode && <div className="text-xs text-muted">fast mode</div>}
      </div>
    </MScreen>
  );
}

function TypeBox({ initial, onSend, title }: { initial: string; onSend: (text: string) => Promise<void>; title: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return (
    <form
      className="m-card m-card-pad m-stack-sm"
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        await onSend(text);
        if (mounted.current) setBusy(false);
      }}
    >
      <div className="m-card-title">{title}</div>
      <textarea value={text} onChange={e => setText(e.target.value.slice(0, 800))} rows={6} className="m-textarea m-type" placeholder="Ladies and gentlemen of the jury…" />
      <button className="m-btn m-btn-ok" disabled={busy || text.trim().length < 3}>
        Submit pitch
      </button>
    </form>
  );
}

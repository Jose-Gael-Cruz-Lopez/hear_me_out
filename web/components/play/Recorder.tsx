'use client';

// 30-second voice pitch: MediaRecorder → /api/transcribe (Muse Voice Transcribe).
// In mock mode we also run the browser's own SpeechRecognition (where available) as a free transcript.
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../shared/ui';

const LIMIT_S = 30;

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  start(): void;
  stop(): void;
};

function makeRecognizer(): SpeechRec | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'en-US';
  return r;
}

export function Recorder({ useBrowserHint, onTranscript }: { useBrowserHint: boolean; onTranscript: (text: string) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [left, setLeft] = useState(LIMIT_S);
  const [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const speech = useRef<SpeechRec | null>(null);
  const hint = useRef('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach(t => t.stop());
    },
    []
  );

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice needs HTTPS (or localhost). Type your pitch instead!');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        speech.current?.stop();
        setState('transcribing');
        await new Promise(r => setTimeout(r, 400));
        try {
          const form = new FormData();
          form.append('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'pitch.webm');
          form.append('hint', hint.current);
          const res = await fetch('/api/transcribe', { method: 'POST', body: form });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? 'Transcription failed');
          onTranscript(json.text);
        } catch (e) {
          setError(`${(e as Error).message}. You can type it instead.`);
        } finally {
          setState('idle');
        }
      };
      hint.current = '';
      if (useBrowserHint) {
        try {
          const r = makeRecognizer();
          if (r) {
            r.onresult = e => {
              hint.current = Array.from(e.results)
                .map(x => x[0]!.transcript)
                .join(' ');
            };
            r.start();
            speech.current = r;
          }
        } catch {
          speech.current = null;
        }
      }
      mr.start(250);
      rec.current = mr;
      setState('recording');
      setLeft(LIMIT_S);
      const started = Date.now();
      timer.current = setInterval(() => {
        const remaining = LIMIT_S - Math.floor((Date.now() - started) / 1000);
        setLeft(remaining);
        if (remaining <= 0) stop();
      }, 250);
    } catch {
      setError("Couldn't get the microphone. Type your pitch instead!");
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (rec.current?.state === 'recording') rec.current.stop();
  };

  return (
    <div className="stack" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      {state === 'idle' && (
        <>
          <button className="rec-btn" onClick={start}>
            <span className="icon">🎙️</span>
            Tap to record
          </button>
          <div className="muted" style={{ fontWeight: 700 }}>
            {LIMIT_S} seconds. Make it count.
          </div>
        </>
      )}
      {state === 'recording' && (
        <>
          <button
            className="rec-ring pop"
            onClick={stop}
            style={{ background: `conic-gradient(var(--red) ${((LIMIT_S - left) / LIMIT_S) * 360}deg, var(--panel2) 0)` }}
            aria-label="Stop recording"
          >
            <span>
              <span className="num">{Math.max(0, left)}</span>
              <span className="lbl">● REC · TAP TO STOP</span>
            </span>
          </button>
          <div className="wave" aria-hidden>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        </>
      )}
      {state === 'transcribing' && (
        <div className="card center" style={{ fontWeight: 800 }}>
          <Spinner /> Transcribing your masterpiece…
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

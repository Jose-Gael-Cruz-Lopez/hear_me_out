'use client';

// 30-second voice pitch: MediaRecorder → /api/transcribe (Muse Voice Transcribe).
// In mock mode we also run the browser's own SpeechRecognition (where available) as a free transcript.
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../ui';

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
        // Give the browser recognizer a moment to deliver its last result.
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
    <div className="stack">
      {state === 'idle' && (
        <button className="btn big pink block" onClick={start}>
          🎙️ Record (30s)
        </button>
      )}
      {state === 'recording' && (
        <button className="btn big block" onClick={stop}>
          <span className="rec-dot" /> Stop · {left}s left
        </button>
      )}
      {state === 'transcribing' && (
        <div className="card center">
          <Spinner /> Transcribing your masterpiece…
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

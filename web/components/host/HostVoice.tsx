'use client';

// The AI host's voice: the browser's built-in speechSynthesis, with on-screen captions and a mute button.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface VoiceApi {
  say: (text: string, key?: string) => void;
  muted: boolean;
}

const VoiceContext = createContext<VoiceApi>({ say: () => {}, muted: true });

export const useHostVoice = () => useContext(VoiceContext);

export function HostVoiceProvider({ children }: { children: ReactNode }) {
  const [caption, setCaption] = useState('');
  const [talking, setTalking] = useState(false);
  const [muted, setMuted] = useState(false);
  const queue = useRef<string[]>([]);
  const speaking = useRef(false);
  const said = useRef(new Set<string>());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    try {
      setMuted(localStorage.getItem('pitchfight:muted') === '1');
    } catch {}
  }, []);

  const pump = useCallback(() => {
    if (speaking.current) return;
    const next = queue.current.shift();
    if (!next) {
      setTalking(false);
      return;
    }
    speaking.current = true;
    setTalking(true);
    setCaption(next);
    const done = () => {
      speaking.current = false;
      setTimeout(pump, 250);
    };
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (mutedRef.current || !synth) {
      setTimeout(done, Math.min(8000, 1200 + next.length * 45));
      return;
    }
    const u = new SpeechSynthesisUtterance(next);
    const voices = synth.getVoices();
    u.voice = voices.find(v => /en-US/.test(v.lang) && /Samantha|Google US|Aria|Jenny/.test(v.name)) ?? voices.find(v => v.lang.startsWith('en')) ?? null;
    u.rate = 1.05;
    u.pitch = 1.1;
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }, []);

  const say = useCallback(
    (text: string, key?: string) => {
      const k = key ?? text;
      if (!text || said.current.has(k)) return;
      said.current.add(k);
      queue.current.push(text);
      pump();
    },
    [pump]
  );

  const toggle = () => {
    const m = !muted;
    setMuted(m);
    try {
      localStorage.setItem('pitchfight:muted', m ? '1' : '0');
    } catch {}
    if (m) window.speechSynthesis?.cancel();
  };

  return (
    <VoiceContext.Provider value={{ say, muted }}>
      {children}
      <div className="captions" aria-live="polite">
        <span className={`orb ${talking ? 'talking' : ''}`}>
          {talking ? (
            <span className="wave sm">
              <span />
              <span />
              <span />
            </span>
          ) : (
            '🎙️'
          )}
        </span>
        <span className="tagline">AI HOST</span>
        <span key={caption} className="text slideup">
          {caption || <span className="muted">The AI host is warming up…</span>}
        </span>
        <button className="btn ghost" onClick={toggle} aria-label={muted ? 'Unmute host' : 'Mute host'}>
          {muted ? '🔇 Muted' : '🔊 Sound on'}
        </button>
      </div>
    </VoiceContext.Provider>
  );
}

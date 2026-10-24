// Tiny synthesized sound effects (no audio files to license or load). Muted state is a per-viewer preference.

type Sfx = 'gavel' | 'ding' | 'whoosh' | 'fanfare' | 'tick' | 'pop' | 'buzz' | 'objection';

const MUTE_KEY = 'hmo:muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const muteListeners = new Set<(m: boolean) => void>();

export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Browsers only allow audio after a user gesture; call this from a click handler. */
export function unlockAudio(): void {
  const c = audioContext();
  if (c.state === 'suspended') void c.resume();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (m && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  for (const l of muteListeners) l(m);
}

export function onMuteChange(l: (m: boolean) => void): () => void {
  muteListeners.add(l);
  return () => muteListeners.delete(l);
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain = 0.2, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(c: AudioContext, start: number, dur: number, gain = 0.3, lowpass = 800) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(start);
}

export function play(sfx: Sfx): void {
  if (muted) return;
  const c = audioContext();
  if (c.state !== 'running') return;
  const t = c.currentTime;
  switch (sfx) {
    case 'gavel':
      noise(c, t, 0.18, 0.9, 600);
      tone(c, 140, t, 0.25, 'triangle', 0.5, 60);
      noise(c, t + 0.22, 0.14, 0.6, 500);
      tone(c, 120, t + 0.22, 0.2, 'triangle', 0.35, 55);
      break;
    case 'objection':
      tone(c, 520, t, 0.12, 'square', 0.12);
      tone(c, 390, t + 0.12, 0.25, 'square', 0.12);
      break;
    case 'ding':
      tone(c, 880, t, 0.5, 'sine', 0.2);
      tone(c, 1320, t + 0.08, 0.5, 'sine', 0.12);
      break;
    case 'whoosh':
      noise(c, t, 0.35, 0.25, 2500);
      break;
    case 'fanfare':
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.45, 'sawtooth', 0.08));
      tone(c, 1047, t + 0.5, 0.9, 'triangle', 0.12);
      break;
    case 'tick':
      tone(c, 1400, t, 0.04, 'square', 0.05);
      break;
    case 'pop':
      tone(c, 600, t, 0.08, 'sine', 0.15, 1200);
      break;
    case 'buzz':
      tone(c, 110, t, 0.4, 'sawtooth', 0.12);
      break;
  }
}

/** Read text aloud with the browser's own voice (used for typed and bot pitches; labeled in the UI). */
export function speak(text: string, opts: { rate?: number; pitch?: number; onEnd?: () => void } = {}): () => void {
  if (muted || typeof speechSynthesis === 'undefined') {
    opts.onEnd?.();
    return () => undefined;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 1.05;
  u.pitch = opts.pitch ?? 1;
  u.onend = () => opts.onEnd?.();
  speechSynthesis.speak(u);
  return () => speechSynthesis.cancel();
}

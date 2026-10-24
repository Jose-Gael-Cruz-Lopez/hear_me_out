import { IconText } from '../components/Ink';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, seatColor, useObjectUrl, VenueImage } from '../components/ui';
import { useRoom } from '../lib/room';
import { audioContext, isMuted, play, speak } from '../lib/sound';
import { tsMs, useNow } from '../lib/time';

const SOURCE_LABEL: Record<string, string> = {
  muse: 'Captions by Muse Voice Transcribe',
  browser: "Captions by this browser's speech recognition",
  typed: 'Typed pitch · read aloud by the browser',
  bot: 'Bot pitch · read aloud by the browser',
};

export function HostPlayback() {
  const { room, playable, playerById, optionById, assignments, media, objections } = useRoom();
  const pitch = playable[room.currentPitchIdx];
  const speaker = pitch ? playerById(pitch.playerId) : undefined;
  const option = pitch ? optionById(pitch.optionId) : undefined;
  const brief = pitch ? assignments.find(a => a.playerId === pitch.playerId) : undefined;
  const audioMedia = pitch?.audioMediaId ? media.get(pitch.audioMediaId) : undefined;
  const audioUrl = useObjectUrl(audioMedia?.bytes, audioMedia?.mime);
  const [level, setLevel] = useState(0);
  const [ended, setEnded] = useState(false);
  const now = useNow(100);
  const gaveled = useRef(false);

  const start = tsMs(room.phaseStartedAt);
  const end = tsMs(room.phaseDeadline);
  const rulingMs = room.fastMode ? 800 : 6000;
  const bodyMs = Math.max(800, end - start - rulingMs);
  const elapsed = now - start;
  const showRuling = ended || elapsed >= bodyMs;

  // Recorded audio from SpacetimeDB, with a live level meter for the bouncing avatar.
  useEffect(() => {
    if (!audioUrl) return;
    const el = new Audio(audioUrl);
    el.muted = isMuted();
    let raf = 0;
    let analyser: AnalyserNode | null = null;
    try {
      const c = audioContext();
      const src = c.createMediaElementSource(el);
      analyser = c.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser).connect(c.destination);
    } catch {
      analyser = null;
    }
    const buf = new Uint8Array(128);
    const loop = () => {
      if (analyser) {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(peak);
      }
      raf = requestAnimationFrame(loop);
    };
    el.onended = () => setEnded(true);
    void el.play().catch(() => setEnded(false));
    loop();
    return () => {
      cancelAnimationFrame(raf);
      el.pause();
      setLevel(0);
    };
  }, [audioUrl]);

  // Typed and bot pitches: the browser reads them aloud (labeled on screen).
  useEffect(() => {
    if (audioUrl || !pitch?.transcript || room.fastMode) return;
    let speaking = true;
    const wobble = setInterval(() => speaking && setLevel(0.2 + Math.random() * 0.5), 140);
    const stop = speak(pitch.transcript, {
      rate: speaker?.isBot ? 1.15 : 1.05,
      pitch: speaker?.isBot ? 1.3 : 1,
      onEnd: () => {
        speaking = false;
        setLevel(0);
        setEnded(true);
      },
    });
    return () => {
      speaking = false;
      clearInterval(wobble);
      stop();
    };
  }, [pitch?.id, audioUrl, pitch?.transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showRuling && !gaveled.current && pitch && pitch.rulingKind !== 'pending') {
      gaveled.current = true;
      play(pitch.rulingKind === 'none' ? 'ding' : 'gavel');
    }
  }, [showRuling, pitch?.rulingKind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pitch || !speaker) return <div className="grid flex-1 place-items-center text-3xl">Next case…</div>;

  const text = pitch.transcript || pitch.liveCaption;
  const words = text.split(/\s+/).filter(Boolean);
  const shown = showRuling ? words.length : Math.ceil(words.length * Math.min(1, elapsed / (bodyMs * 0.92)));
  const objectionCount = objections.filter(o => o.pitchId === pitch.id).length;
  const color = seatColor(speaker.seat);

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="flex gap-2">
          {playable.map((p, i) => (
            <span key={String(p.id)} className={`h-3 w-10 rounded-full ${i < room.currentPitchIdx ? 'bg-cream/40' : i === room.currentPitchIdx ? 'bg-sun' : 'bg-ink-3'}`} />
          ))}
        </div>
        <div className="playback-speaker"><Avatar player={speaker} size={200} bounce={level} /></div>
        <div className="text-center">
          <div className="font-display text-xl font-black text-cream/60">defending</div>
          <div className="font-display text-5xl leading-tight font-black" style={{ color }}>
            {option?.title}
          </div>
          {brief && <div className="mt-2 max-w-md text-xl text-cream/80 italic">“{brief.stylePrompt}”</div>}
        </div>
        {option && <VenueImage option={option} className="h-40 w-full max-w-md rounded-3xl" />}
      </div>

      <div className="flex flex-col justify-center gap-6">
        <div className="card min-h-72 p-8">
          {text ? (
            <p className="font-display text-4xl leading-snug font-extrabold">
              {words.map((w, i) => (
                <span key={i} className={i < shown ? 'text-cream' : 'text-cream/15'}>
                  {w}{' '}
                </span>
              ))}
            </p>
          ) : (
            <p className="font-display text-3xl font-bold text-cream/50">{pitch.status === 'transcribing' ? 'Transcribing… (audio only for now)' : '…'}</p>
          )}
          <div className="mt-4 text-sm font-bold text-muted">{SOURCE_LABEL[pitch.transcriptSource] ?? (audioUrl ? 'Recorded pitch' : '')}</div>
        </div>

        <AnimatePresence>
          {showRuling && (
            <motion.div initial={{ scale: 2.2, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 420, damping: 14 }}>
              {pitch.rulingKind === 'sustained' && (
                <div className="rounded-3xl bg-sustain p-6 text-white shadow-[0_8px_0_rgb(0_0_0/0.35)]">
                  <div className="font-display text-xl font-black tracking-[0.3em]"><IconText text={"🔨 THE JUDGE RULES"} /></div>
                  <div className="mt-2 font-display text-4xl leading-tight font-black">{pitch.rulingText}</div>
                </div>
              )}
              {pitch.rulingKind === 'verified' && (
                <div className="rounded-3xl bg-verify p-6 text-ink shadow-[0_8px_0_rgb(0_0_0/0.35)]">
                  <div className="font-display text-xl font-black tracking-[0.3em]"><IconText text={"✅ FACT CHECK"} /></div>
                  <div className="mt-2 font-display text-4xl leading-tight font-black">{pitch.rulingText}</div>
                </div>
              )}
              {pitch.rulingKind === 'none' && objectionCount > 0 && (
                <div className="rounded-3xl bg-ink-3 p-6 shadow-[0_8px_0_rgb(0_0_0/0.35)]">
                  <div className="font-display text-3xl font-black">Objection overruled. No facts on file to contradict it.</div>
                </div>
              )}
              {pitch.rulingKind === 'pending' && <div className="card p-6 font-display text-2xl font-black text-cream/70"><IconText text={"⚖️ The Judge is checking the facts…"} /></div>}
            </motion.div>
          )}
        </AnimatePresence>

        {objectionCount > 0 && (
          <div className="chip self-start bg-sustain/20 px-4 py-2 text-lg text-sustain ring-1 ring-sustain/50">
            {objectionCount} objection{objectionCount === 1 ? '' : 's'} from the jury
          </div>
        )}
      </div>
    </div>
  );
}

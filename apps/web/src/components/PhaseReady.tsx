import { useRef, useState } from 'react';
import { useCall, useRoom } from '../lib/room';

/** Only readiness is public. Private ballots and leans never leave their existing views. */
export function PhaseReady({ label = 'Continue' }: { label?: string }) {
  const { room } = useRoom();
  return <PhaseReadyAction key={`${room.id}:${room.phaseSeq}`} label={label} />;
}

function PhaseReadyAction({ label }: { label: string }) {
  const { room, me, players } = useRoom();
  const call = useCall();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const humans = players.filter(p => !p.isBot);
  const count = humans.filter(p => p.actedSeq === room.phaseSeq).length;
  const done = me?.actedSeq === room.phaseSeq;
  if (!me) return null;
  return <div className="phase-ready">
    <button type="button" className={`m-btn ${done ? 'phase-ready-done' : ''}`} disabled={done || saving} aria-busy={saving} onClick={async () => {
      if (busy.current || done) return;
      busy.current = true;
      setSaving(true);
      await call(c => c.reducers.acknowledgePhase({ roomId: room.id, phaseSeq: room.phaseSeq }));
      busy.current = false;
      setSaving(false);
    }}>{saving ? 'Saving…' : done ? 'Ready ✓' : label}</button>
    <span className="m-small m-dim" role="status">{count}/{humans.length} ready · next when everyone is ready</span>
  </div>;
}

/** Public task completion only; all private choices stay in their existing views. */
export function PhaseReadiness() {
  const { room, players } = useRoom();
  const humans = players.filter(p => !p.isBot);
  return <div className="phase-readiness" role="status">{humans.filter(p => p.actedSeq === room.phaseSeq).length}/{humans.length} ready · continue on your phone</div>;
}

export function useTaskProgress() {
  const { room, players } = useRoom();
  const humans = players.filter(p => !p.isBot);
  return `${humans.filter(p => p.actedSeq === room.phaseSeq).length}/${humans.length} picked`;
}

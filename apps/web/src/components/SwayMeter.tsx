// Live Sway Meter: an anonymous bar of where the room leans while someone pitches, built from the
// `room_sway` view (totals only, never who leans where), plus Most Persuasive as it happens.
import { sway } from '@hmo/module/logic/sway';
import { useMemo } from 'react';
import { useCall, useRoom } from '../lib/room';
import { play } from '../lib/sound';
import { useLiveChoice } from '../lib/useLiveChoice';
import { VenueImage } from './ui';

const SWAY_COLORS = ['#f2dc6e', '#d1e6eb', '#f3d8d2', '#dbe4c9'];
export const swayColor = (i: number) => SWAY_COLORS[i % SWAY_COLORS.length];

function useSway() {
  const { options, sway: totals, assignments } = useRoom();
  return useMemo(() => sway(options, totals, assignments), [options, totals, assignments]);
}

/** The TV's anonymous tug-of-war bar. `compact` is the phone-sized version. */
export function SwayMeter({ compact = false }: { compact?: boolean }) {
  const { options, playerById, optionById, room, playable } = useRoom();
  const { standings, leaning, persuasive } = useSway();
  if (options.length < 2 || standings.length === 0) return null;
  const onStage = playable[room.currentPitchIdx]?.optionId;
  const even = leaning === 0;
  const winners = persuasive ? persuasive.advocateIds.map(id => playerById(id)?.name).filter(Boolean) : [];

  return (
    <div className={`sway ${compact ? 'sway-compact' : ''}`} aria-live="polite">
      <div className="sway-head">
        <span className="sway-kicker">Live sway</span>
        <span className="sway-count">{even ? 'Nobody is leaning yet' : `${leaning} leaning · anonymous`}</span>
      </div>
      <div className="sway-bar" role="img" aria-label={standings.map(s => `${optionById(s.optionId)?.title}: ${Math.round(s.share * 100)}%`).join(', ')}>
        {standings.map((s, i) => (
          <div
            key={String(s.optionId)}
            className={`sway-seg ${s.optionId === onStage ? 'on-stage' : ''}`}
            style={{ flexGrow: even ? 1 : s.share, background: swayColor(i) }}
          >
            {(even || s.share >= (compact ? 0.15 : 0.1)) && <b>{even ? '–' : `${Math.round(s.share * 100)}%`}</b>}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="sway-legend">
          {standings.map((s, i) => (
            <span key={String(s.optionId)} className={s.optionId === onStage ? 'on-stage' : ''}>
              <i style={{ background: swayColor(i) }} />
              {optionById(s.optionId)?.title}
              {s.gain !== 0 && <em className={s.gain > 0 ? 'up' : 'down'}>{s.gain > 0 ? `▲${s.gain}` : `▼${-s.gain}`}</em>}
            </span>
          ))}
        </div>
      )}
      <div className="sway-persuasive">
        {persuasive && winners.length ? (
          <>
            <span className="sway-kicker">Most persuasive right now</span>
            <b>{winners.join(' & ')}</b>
            <span>
              {' '}
              swung {persuasive.gain} {persuasive.gain === 1 ? 'person' : 'people'} to {optionById(persuasive.optionId)?.title}
            </span>
          </>
        ) : (
          <span className="text-muted">Nobody has changed their mind yet. Make them.</span>
        )}
      </div>
    </div>
  );
}

/** Phone: your private lean. Starts at your secret pre-vote; tap a finalist any time during the pitches. */
export function LeanPicker() {
  const { options, room, myLeanOptionId, me } = useRoom();
  const call = useCall();
  const choice = useLiveChoice(myLeanOptionId, `${room.id}:playback`);
  if (!me || options.length < 2) return null;
  return (
    <div className="lean-picker">
      <div className="sway-head">
        <span className="sway-kicker">Your lean · private</span>
        <span className="sway-count" role="status">{choice.saving ? 'Saving…' : 'Only the totals reach the TV'}</span>
      </div>
      <div className="lean-options">
        {options.map((o, i) => {
          const on = choice.value === o.id;
          return (
            <button
              key={String(o.id)}
              type="button"
              aria-pressed={on}
              aria-busy={choice.saving}
              disabled={choice.saving}
              className={`lean-option ${on ? 'on' : ''}`}
              style={{ ['--sway' as string]: swayColor(i) }}
              onClick={() => {
                if (on) return;
                play('pop');
                void choice.select(o.id, () => call(c => c.reducers.setLean({ roomId: room.id, optionId: o.id })));
              }}
            >
              <VenueImage option={o} className="lean-photo" />
              <span>{o.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Phone (mobile design): the anonymous bar and your private lean in one card. Tap a place to lean
 * toward it; nobody sees who leans where, only the totals.
 */
export function SwayLeanCard() {
  const { options, room, myLeanOptionId, me, playerById } = useRoom();
  const call = useCall();
  const choice = useLiveChoice(myLeanOptionId, `${room.id}:playback`);
  const { standings, leaning, persuasive } = useSway();
  if (options.length < 2 || standings.length === 0) return null;
  const even = leaning === 0;
  const winners = persuasive ? persuasive.advocateIds.map(id => playerById(id)?.name).filter(Boolean) : [];
  return (
    <div className="m-sway">
      <div className="m-sway-head">
        <span className="m-label">LIVE SWAY</span>
        <span className="m-dim m-small" role="status">{choice.saving ? 'Saving…' : me ? 'Tap where you’re leaning' : `${leaning} leaning`}</span>
      </div>
      <div className="m-sway-bar" role="img" aria-label={standings.map((s, i) => `${options[i]?.title}: ${Math.round(s.share * 100)}%`).join(', ')}>
        {standings.map((s, i) => (
          <div key={String(s.optionId)} style={{ flexGrow: even ? 1 : s.share, background: swayColor(i) }}>
            {(even || s.share >= 0.15) && (even ? '–' : `${Math.round(s.share * 100)}%`)}
          </div>
        ))}
      </div>
      {me && (
        <div className="m-lean-grid">
          {options.map((o, i) => {
            const on = choice.value === o.id;
            return (
              <button
                key={String(o.id)}
                type="button"
                aria-pressed={on}
                aria-busy={choice.saving}
                disabled={choice.saving}
                className={`m-lean ${on ? 'on' : ''}`}
                style={{ ['--sway' as string]: swayColor(i) }}
                onClick={() => {
                  if (on) return;
                  play('pop');
                  void choice.select(o.id, () => call(c => c.reducers.setLean({ roomId: room.id, optionId: o.id })));
                }}
              >
                <VenueImage option={o} className="m-lean-photo" />
                <span>{o.title}</span>
              </button>
            );
          })}
        </div>
      )}
      {persuasive && winners.length > 0 && (
        <div className="m-small m-sway-who">
          <b>{winners.join(' & ')}</b> swung {persuasive.gain} {persuasive.gain === 1 ? 'person' : 'people'} so far
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useCall, useRoom } from '../lib/room';
import { toast } from '../lib/toast';
import { Avatar } from './ui';

const KEY = 'hmo:blocked';

function readBlocked(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Public meetups: block & report on every player card. Blocked players disappear from your view right away. */
export function SafetyList() {
  const { room, players, me } = useRoom();
  const call = useCall();
  const [blocked, setBlocked] = useState<string[]>(readBlocked);
  const [reporting, setReporting] = useState<string | null>(null);
  if (room.mode !== 'strangers') return null;
  const others = players.filter(p => p.id !== me?.id && !p.isBot);
  if (others.length === 0) return null;
  return (
    <div className="card space-y-3 p-4">
      <div className="text-sm font-bold text-muted">PEOPLE IN THIS MEETUP</div>
      {others.map(p => {
        const isBlocked = blocked.includes(String(p.id));
        return (
          <div key={String(p.id)} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar player={p} size={40} label={false} dim={isBlocked} />
              <span className="font-bold">{isBlocked ? 'Blocked' : p.name}</span>
            </div>
            {!isBlocked && (
              <button
                className="chip bg-ink-3 text-sustain"
                disabled={reporting !== null}
                onClick={async () => {
                  setReporting(String(p.id));
                  const reported = await call(c => c.reducers.reportPlayer({ roomId: room.id, playerId: p.id, reason: 'reported from player card' }));
                  setReporting(null);
                  if (!reported) return;
                  const next = [...blocked, String(p.id)];
                  setBlocked(next);
                  try {
                    sessionStorage.setItem(KEY, JSON.stringify(next));
                  } catch {
                    /* ignore */
                  }
                  toast(`Blocked and reported ${p.name}. Thanks for keeping it friendly.`);
                }}
              >
                {reporting === String(p.id) ? 'Reporting…' : 'Block & report'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

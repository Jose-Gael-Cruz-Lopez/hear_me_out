import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { Crowd } from '../components/Crowd';
import { DoodleIcon } from '../components/DoodleIcon';
import { useCall, useRoom } from '../lib/room';
import { ProfileFlow } from './Profile';

/** When the matcher moves my player into a new room, follow it. */
export function FollowMatch() {
  const { room } = useRoom();
  const { identity } = useSpacetimeDB();
  const [, navigate] = useLocation();
  const [mine] = useTable(identity ? tables.player.where(p => p.identity.eq(identity)) : tables.player, { enabled: !!identity });
  const [matched] = useTable(tables.room.where(r => r.mode.eq('strangers').and(r.isPublic.eq(false))));
  useEffect(() => {
    const target = matched.find(r => r.id !== room.id && mine.some(p => p.roomId === r.id));
    if (target) navigate(`/play/${target.code}`);
  }, [mine, matched, room.id, navigate]);
  return null;
}

/** The matchmaking queue: build your vibe, then wait to be matched with people who share it. */
export function QueueScreen() {
  const { me, players, room } = useRoom();
  const [, navigate] = useLocation();
  const call = useCall();
  const [leaving, setLeaving] = useState(false);
  const waiting = players.filter(p => p.ready && p.connected && !p.isBot);
  return <div className="flex flex-1 flex-col gap-5">
    <div className="flex items-center justify-between gap-3">
      <span className="chip bg-sun">FIND MY PEOPLE</span>
      <button className="chip bg-white px-3 py-2" disabled={leaving} onClick={async()=>{
        setLeaving(true);
        if(await call(c=>c.reducers.leaveRoom({roomId:room.id}))) navigate('/');
        else setLeaving(false);
      }}><DoodleIcon name="arrowLeft" size={16} />{leaving?'Leaving…':'Leave queue'}</button>
    </div>
    {!me?.ready ? <ProfileFlow /> : <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="queue-scene"><Crowd variant="stage" phase="LOBBY" members={waiting.map(p=>({id:p.id,name:p.name,connected:p.connected,status:'Vibe approved'}))} /></div>
      <h1 className="ink-heading text-4xl">Finding your people…</h1>
      <p className="max-w-md text-base text-muted">{waiting.length} {waiting.length === 1 ? 'person has' : 'people have'} approved their vibe. We'll form a group of 3–4 based on shared interests.</p>
      <div className="flex items-center gap-2 text-sm font-black"><DoodleIcon name="lock" size={18} />Only the tags you approved are shared.</div>
      <p className="text-sm text-muted">Keep this page open. Your group and game will appear here automatically—no host or TV needed.</p>
    </section>}
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { Crowd } from '../components/Crowd';
import { DoodleIcon } from '../components/DoodleIcon';
import { useLocation } from 'wouter';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { Logo } from '../components/ui';
import { MuseConnectedPill } from '../components/Muse';
import { useCall } from '../lib/room';
import { unlockAudio } from '../lib/sound';

export function Home() {
  const [, navigate] = useLocation();
  const { identity, isActive } = useSpacetimeDB();
  const call = useCall();
  const [rooms] = useTable(tables.room);
  const [code, setCode] = useState('');
  const creating = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const joinDialog = useRef<HTMLDialogElement>(null);

  // After create_room, jump to the newest room this tab hosts.
  useEffect(() => {
    if (creating.current === null || !identity) return;
    const mine = rooms
      .filter(r => r.hostIdentity.isEqual(identity) && Number(r.createdAt.microsSinceUnixEpoch / 1000n) >= creating.current! - 5000)
      .sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch))[0];
    if (mine) {
      creating.current = null;
      navigate(`/host/${mine.code}`);
    }
  }, [rooms, identity, navigate]);

  const host = async (mode: 'friends' | 'strangers') => {
    unlockAudio();
    setBusy(true);
    creating.current = Date.now();
    await call(c => c.reducers.createRoom({ mode, tzOffsetMin: -new Date().getTimezoneOffset(), fastMode: false }));
    setBusy(false);
  };

  return (
    <main className="ink-cover">
      <Crowd variant="cover" />
      <div className="cover-wash" />
      <button className="cover-join ink-pill" onClick={() => joinDialog.current?.showModal()}>Join a room <DoodleIcon name="arrowUpRight" size={18} /></button>
      <MuseConnectedPill />
      <section className="cover-center" aria-label="Hear Me Out">
        <Logo size="xl" />
        <p className="cover-tagline">Make your case. Make a plan.</p>
        <div className="cover-actions">
          <button className="ink-pill primary" disabled={!isActive || busy} onClick={() => host('friends')}>Friends game <DoodleIcon name="arrow" size={18} /></button>
          <button className="ink-pill" onClick={() => navigate('/meet')}>Find my people <DoodleIcon name="group" size={18} /></button>
        </div>
        <div className="cover-other">
          <button disabled={!isActive || busy} onClick={() => host('strangers')}>Host a public meetup</button>
          <span aria-hidden="true">·</span>
          <button onClick={() => navigate('/lobbies')}>Browse open meetups</button>
        </div>
      </section>
      <p className="cover-footnote">A party game about finally deciding where to go. Friends or soon-to-be friends.</p>
      {/* Phones (mobile design): join-by-code is the front door; hosting happens on a TV or laptop. */}
      <form className="cover-mobile" onSubmit={e => {
        e.preventDefault(); unlockAudio();
        if (code.trim().length === 4) navigate(`/play/${code.trim().toUpperCase()}`);
      }}>
        <label className="meet-label" htmlFor="m-room-code">GOT A ROOM CODE?</label>
        <div className="cover-mobile-row">
          <input id="m-room-code" value={code} onChange={e => setCode(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase())} placeholder="CODE" autoComplete="off" className="cover-mobile-code" />
          <button className="m-btn" disabled={code.length !== 4}>Join <DoodleIcon name="arrow" size={18} /></button>
        </div>
        <button type="button" className="m-btn m-btn-alt cover-mobile-meet" onClick={() => navigate('/meet')}>Find my people <DoodleIcon name="group" size={18} /></button>
        <div className="cover-mobile-note">Hosting? Open Hear Me Out on a TV or laptop.</div>
      </form>
      <dialog ref={joinDialog} className="ink-dialog" onClick={e => { if (e.target === e.currentTarget) joinDialog.current?.close(); }}>
        <button type="button" className="dialog-close" aria-label="Close join dialog" onClick={() => joinDialog.current?.close()}><DoodleIcon name="cross" /></button>
        <form className="space-y-5 text-center" onSubmit={e => {
          e.preventDefault(); unlockAudio();
          if (code.trim().length === 4) navigate(`/play/${code.trim().toUpperCase()}`);
        }}>
          <DoodleIcon name="ticket" size={48} />
          <h1 className="ink-heading text-4xl">Got a room?</h1>
          <label className="block font-bold" htmlFor="room-code">Enter the four-letter code</label>
          <input id="room-code" value={code} onChange={e => setCode(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0,4).toUpperCase())} placeholder="ROOM CODE" autoComplete="off" className="w-full rounded-2xl px-5 py-4 text-center text-3xl font-black tracking-[.3em]" />
          <button className="btn btn-pop w-full" disabled={code.length !== 4}>Join the game <DoodleIcon name="arrow" /></button>
        </form>
      </dialog>
    </main>
  );
}

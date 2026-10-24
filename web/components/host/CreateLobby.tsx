'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAction, useConn } from '@/lib/stdb';
import { DEFAULT_LOCATION } from '@/lib/game/questions';
import { ErrorBox, Spinner } from '../ui';

// No I/O so codes are easy to read off a TV.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, b => LETTERS[b % LETTERS.length]).join('');
}

export function CreateLobby() {
  const router = useRouter();
  const { conn, isActive } = useConn();
  const act = useAction();
  const [loc, setLoc] = useState({ label: DEFAULT_LOCATION.label, lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng });
  const [locating, setLocating] = useState(false);

  const useMyLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => {
        setLoc({ label: 'Near the host', lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  };

  const start = () =>
    act.run(async () => {
      let lastErr: unknown;
      for (let i = 0; i < 5; i++) {
        const code = randomCode();
        try {
          await conn!.reducers.createLobby({ code, locationLabel: loc.label, lat: loc.lat, lng: loc.lng });
          router.push(`/host/${code}`);
          return;
        } catch (e) {
          lastErr = e;
          if (!String((e as Error).message).includes('taken')) throw e;
        }
      }
      throw lastErr;
    });

  return (
    <main className="phone" style={{ justifyContent: 'center', gap: 24 }}>
      <div className="center">
        <div className="logo" style={{ fontSize: '3rem' }}>
          Pitch Fight
        </div>
        <p className="muted">This screen becomes the big screen. Put it where everyone can see it.</p>
      </div>
      <div className="card stack">
        <div className="muted small">Finding places near</div>
        <b style={{ fontSize: '1.2rem' }}>📍 {loc.label}</b>
        <button className="btn ghost" onClick={useMyLocation} disabled={locating}>
          {locating ? <Spinner /> : '🧭'} Use my current location instead
        </button>
      </div>
      <button className="btn big pink block" disabled={!isActive || act.busy} onClick={start}>
        {!isActive ? (
          <>
            <Spinner /> Connecting to SpacetimeDB…
          </>
        ) : (
          '🥊 Start game'
        )}
      </button>
      <ErrorBox error={act.error} />
    </main>
  );
}

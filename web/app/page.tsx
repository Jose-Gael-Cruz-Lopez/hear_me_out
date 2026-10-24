'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 4) router.push(`/play/${code.trim().toUpperCase()}`);
  };
  return (
    <main className="phone" style={{ justifyContent: 'center', gap: 28 }}>
      <div className="center">
        <div className="logo" style={{ fontSize: '3.4rem' }}>Pitch Fight</div>
        <p className="muted" style={{ fontSize: '1.15rem' }}>
          Can&apos;t decide where to go? Argue about it. The AI host runs the show, everyone votes, and the winner becomes the plan.
        </p>
      </div>
      <a className="btn big block" href="/host">
        📺 Start a game
      </a>
      <p className="muted small center" style={{ marginTop: -16 }}>
        Open this on a laptop or TV — it&apos;s the big screen.
      </p>
      <form className="card stack" onSubmit={join}>
        <label style={{ fontWeight: 800 }}>📱 Joining from your phone?</label>
        <input
          className="input display center"
          style={{ fontSize: '2rem', letterSpacing: '0.3em' }}
          placeholder="CODE"
          maxLength={4}
          value={code}
          onChange={e => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button className="btn pink block" disabled={code.length !== 4}>
          Join game
        </button>
      </form>
    </main>
  );
}

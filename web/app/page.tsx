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
    <main className="phone" style={{ justifyContent: 'center', gap: 24 }}>
      <div className="center stack" style={{ alignItems: 'center' }}>
        <div className="hero-avatar" style={{ background: 'var(--yellow)', width: 120, height: 120, fontSize: 64 }}>
          🥊
        </div>
        <div className="logo pop" style={{ fontSize: '3.6rem' }}>
          Pitch Fight
        </div>
        <p className="muted" style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
          Can&apos;t decide where to go? Argue about it. The AI host runs the show, everyone votes, and the winner becomes the plan.
        </p>
      </div>
      <form className="card stack slideup" onSubmit={join}>
        <div className="eyebrow">📱 Joining from your phone?</div>
        <input
          className="input display center"
          style={{ fontSize: '2.4rem', letterSpacing: '0.3em' }}
          placeholder="CODE"
          maxLength={4}
          value={code}
          onChange={e => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Room code"
        />
        <button className={`btn big pink block ${code.length === 4 ? 'breathe' : ''}`} disabled={code.length !== 4}>
          Join the fight 🥊
        </button>
      </form>
      <a className="btn cyan block" href="/host">
        📺 Host a game on the big screen
      </a>
    </main>
  );
}

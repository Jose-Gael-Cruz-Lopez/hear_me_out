import { useState } from 'react';
import { Logo, seatColor } from '../components/ui';
import { useCall, useRoom } from '../lib/room';
import { unlockAudio } from '../lib/sound';

const AVATARS = ['🦊', '🐙', '🐸', '🦄', '🐼', '🐯', '🦖', '🐝', '🦉', '🐳', '🌮', '🍕', '🍣', '👽', '🎃', '🤠'];

export function JoinForm() {
  const { room, players } = useRoom();
  const call = useCall();
  const taken = new Set(players.map(p => p.avatar));
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS.find(a => !taken.has(a)) ?? AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const open = room.phase === 'lobby' || room.phase === 'profiles';

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <Logo />
      <div className="font-display text-2xl font-black">
        Room <span className="tracking-widest text-sun">{room.code}</span>
      </div>
      {!open ? (
        <div className="card p-6 text-lg">This game already started. Ask the host to start a new room.</div>
      ) : (
        <form
          className="card space-y-5 p-6"
          onSubmit={async e => {
            e.preventDefault();
            unlockAudio();
            setBusy(true);
            await call(c => c.reducers.joinRoom({ code: room.code, name, avatar }));
            setBusy(false);
          }}
        >
          <label className="block">
            <span className="text-sm font-bold text-muted">FIRST NAME</span>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 20))}
              autoFocus
              placeholder="Your name"
              className="mt-1 w-full rounded-2xl bg-ink px-4 py-3 font-display text-2xl font-black ring-2 ring-white/10 outline-none focus:ring-sun"
            />
          </label>
          <div>
            <span className="text-sm font-bold text-muted">PICK AN AVATAR</span>
            <div className="mt-2 grid grid-cols-8 gap-2">
              {AVATARS.map((a, i) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => setAvatar(a)}
                  disabled={taken.has(a)}
                  className="grid aspect-square place-items-center rounded-2xl text-2xl transition disabled:opacity-20"
                  style={{ background: avatar === a ? seatColor(i) : 'rgb(255 255 255 / 0.06)', transform: avatar === a ? 'scale(1.1)' : undefined }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-pop w-full" disabled={!name.trim() || busy}>
            I'm in!
          </button>
        </form>
      )}
    </div>
  );
}

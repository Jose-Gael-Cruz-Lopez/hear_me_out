import { IconText, AvatarMark } from '../components/Ink';
import { useState } from 'react';
import { Link } from 'wouter';
import { Logo } from '../components/ui';
import { useCall, useRoom } from '../lib/room';
import { unlockAudio } from '../lib/sound';

const AVATARS = ['🦊', '🐙', '🐸', '🦄', '🐼', '🐯', '🦖', '🐝', '🦉', '🐳', '🌮', '🍕', '🍣', '👽', '🎃', '🤠'];

export function JoinForm() {
  const { room, players } = useRoom();
  const call = useCall();
  const taken = new Set(players.map(p => p.avatar));
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS.find(a => !taken.has(a)) ?? AVATARS[0]);
  const selectedAvatar = taken.has(avatar) ? (AVATARS.find(a => !taken.has(a)) ?? avatar) : avatar;
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState(false);
  const isPublic = room.mode === 'strangers' || room.mode === 'queue';
  const open = room.phase === 'lobby' || room.phase === 'profiles';

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <Logo />
      <div className="font-display text-2xl font-black">
        Room <span className="tracking-widest text-sun">{room.code}</span>
      </div>
      {!open ? (
        <div className="card space-y-4 p-6 text-lg">
          <p>This game already started. Ask the host to start a new room.</p>
          <Link href="/" className="btn btn-sun w-full">Back home</Link>
        </div>
      ) : (
        <form
          className="card space-y-5 p-6"
          onSubmit={async e => {
            e.preventDefault();
            unlockAudio();
            setBusy(true);
            await call(c => (isPublic ? c.reducers.joinPublicRoom({ code: room.code, name, avatar: selectedAvatar, confirmed18: adult }) : c.reducers.joinRoom({ code: room.code, name, avatar: selectedAvatar })));
            setBusy(false);
          }}
        >
          <label className="block">
            <span className="text-sm font-bold text-muted">FIRST NAME{isPublic ? ' (ONE WORD)' : ''}</span>
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
                  aria-label={`Avatar ${i+1}`}
                  aria-pressed={selectedAvatar === a}
                  onClick={() => setAvatar(a)}
                  disabled={taken.has(a)}
                  className="avatar-choice grid aspect-square place-items-center rounded-2xl transition disabled:opacity-20"
                  style={{ background: selectedAvatar === a ? '#f2dc6e' : '#fff', transform: selectedAvatar === a ? 'scale(1.1)' : undefined }}
                >
                  <AvatarMark value={a} size={36} />
                </button>
              ))}
            </div>
          </div>
          {isPublic && (
            <div className="space-y-2 rounded-2xl bg-sky/10 p-4 text-sm ring-1 ring-sky/30">
              <div className="font-bold text-sky"><IconText text={"🛡️ Public meetup with people you don't know yet"} /></div>
              <ul className="list-disc space-y-0.5 pl-5 text-cream/80">
                <li>First names only</li>
                <li>Public venues only; the exact address unlocks after you RSVP</li>
                <li>Block & report from the lobby or final plan</li>
                <li>A meetup is confirmed once 3 people RSVP</li>
              </ul>
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="h-5 w-5 accent-[#a3ff5c]" />
                I'm 18 or older
              </label>
            </div>
          )}
          <button className="btn btn-pop w-full" disabled={!name.trim() || busy || (isPublic && !adult)}>
            I'm in!
          </button>
        </form>
      )}
    </div>
  );
}

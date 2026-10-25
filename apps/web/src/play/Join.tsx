import { AvatarMark } from '../components/Ink';
import { DoodleIcon } from '../components/DoodleIcon';
import { MScreen } from '../components/Mobile';
import { useState } from 'react';
import { Link } from 'wouter';
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

  const canJoin = !!name.trim() && !busy && (!isPublic || adult);
  return (
    <div className="m-frame m-join">
      <div className="m-join-top">
        <Link href="/" className="meet-back" aria-label="Back to home"><DoodleIcon name="arrowLeft" size={20} /></Link>
        <div className="m-join-room">
          Room <span>{room.code}</span>
        </div>
      </div>
      {!open ? (
        <MScreen action={<Link href="/" className="m-btn">Back home</Link>}>
          <h1 className="m-h1">This game already started</h1>
          <p className="m-sub">Ask the host to start a new room.</p>
        </MScreen>
      ) : (
        <MScreen
          action={
            <button type="submit" form="join-form" className="m-btn" disabled={!canJoin}>
              I'm in!
            </button>
          }
        >
          <form
            id="join-form"
            className="m-stack m-join-form"
            onSubmit={async e => {
              e.preventDefault();
              unlockAudio();
              setBusy(true);
              await call(c => (isPublic ? c.reducers.joinPublicRoom({ code: room.code, name, avatar: selectedAvatar, confirmed18: adult }) : c.reducers.joinRoom({ code: room.code, name, avatar: selectedAvatar })));
              setBusy(false);
            }}
          >
            <h1 className="m-h1">Who's making the case?</h1>
            <label className="meet-field">
              <span className="meet-label">FIRST NAME{isPublic ? ' (ONE WORD)' : ''}</span>
              <input value={name} onChange={e => setName(e.target.value.slice(0, 20))} autoFocus placeholder="Your name" className="meet-input meet-name" />
            </label>
            <div>
              <span className="meet-label">PICK YOUR PERSON</span>
              <div className="m-character-preview" aria-hidden="true"><AvatarMark value={selectedAvatar} size={112} /></div>
              <div className="meet-avatars m-join-avatars">
                {AVATARS.map((a, i) => (
                  <button type="button" key={a} aria-label={`Avatar ${i + 1}`} aria-pressed={selectedAvatar === a} onClick={() => setAvatar(a)} disabled={taken.has(a)} className="avatar-choice">
                    <AvatarMark value={a} size={40} />
                  </button>
                ))}
              </div>
              {taken.size > 0 && <div className="m-small m-dim m-join-note">Faded ones are taken in this room.</div>}
            </div>
            {isPublic && (
              <div className="meet-safety">
                <div className="meet-safety-note">
                  <DoodleIcon name="shield" size={22} />
                  <span>First names. Public places. Your choice to join.</span>
                </div>
                <details className="m-safety-details"><summary>Meetup safety</summary><ul><li>Address unlocks after you RSVP.</li><li>Three RSVPs confirm the meetup.</li><li>Block or report from the lobby or plan.</li></ul></details>
                <label className="meet-check">
                  <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />
                  <span className="meet-box" aria-hidden="true">{adult && <DoodleIcon name="check" size={16} />}</span>
                  I'm 18 or older
                </label>
              </div>
            )}
          </form>
        </MScreen>
      )}
    </div>
  );
}

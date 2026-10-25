import { Fragment } from 'react';
import { characterLook } from '../lib/characters';
import { DoodleIcon, type DoodleIconName } from './DoodleIcon';

// Keep legacy emoji values on the wire (avatars/reactions are validated server-side),
// while rendering every control with the same original ink SVG vocabulary.
const GLYPHS: Record<string, DoodleIconName> = {
  '🧑‍⚖️':'shield', '🛡️':'shield', '🗺️':'map', '🗓️':'calendar', '🛰️':'search',
  '🎙️':'mic', '⚖️':'shield', '⌨️':'keyboard', '🗳️':'vote', '🕹️':'bowling',
  '📺':'group', '🙋':'person', '📍':'mapPin', '👥':'group', '🕒':'clock',
  '✨':'spark', '🔇':'volumeOff', '🔊':'volume', '★':'star', '⚠️':'info',
  '🍜':'noodles', '🌮':'taco', '🎤':'mic', '🎳':'bowling', '🎬':'film',
  '🔥':'bolt', '🤫':'lock', '🧾':'ticket', '😂':'chat', '👏':'group',
  '😱':'spark', '💯':'trophy', '🤔':'question', '🏆':'trophy', '💬':'chat',
  '✅':'check', '💚':'heart', '📅':'calendar', '🔗':'link', '📝':'edit',
  '🎉':'spark', '🤝':'group', '⏭':'arrow', '🔨':'shield', '🔭':'search',
  '🔒':'lock', '📋':'copy', '🤖':'bot', '🏛️':'map', '📜':'ticket',
  '▶':'play', '✓':'check', '✕':'cross', '←':'arrowLeft',
};
const keys = Object.keys(GLYPHS).sort((a,b)=>b.length-a.length);
const pattern = new RegExp(`(${keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`, 'gu');

export function IconText({ text, size }: { text: string; size?: number }) {
  return <>{text.split(pattern).map((part,i)=>GLYPHS[part]
    ? <DoodleIcon key={i} name={GLYPHS[part]} size={size ?? '1em'} />
    : <Fragment key={i}>{part}</Fragment>)}</>;
}

export function AvatarMark({ value = '', size = 44, pose = 'idle' }: { value?: string; size?: number; pose?: 'idle' | 'move' }) {
  const look = characterLook(value);
  return <span aria-hidden="true" className="avatar-mark" data-character={look} style={{ width: size, height: size }}>
    <img src={`/people/${look}-${pose}.svg`} alt="" width={size} height={size} draggable={false} />
  </span>;
}

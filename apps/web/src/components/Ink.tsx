import { Fragment } from 'react';
import { characterSeed } from '../lib/characters';
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

export function AvatarMark({ value = '', size = 44 }: { value?: string; size?: number }) {
  const seed = characterSeed(value);
  const shirt = seed % 3 === 1;
  // Native paths, no raster tracing or blur: the same contour works at 32px and 320px.
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 96 128" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="avatar-mark">
    <path d="M32 87l-3 25q-1 6 5 6h9l4-23 3 23h12q6 0 4-6l-4-25" fill="#fffefb" />
    <path d="M32 57c-12 6-17 20-18 33q0 5 5 5t6-4l4-13-1 19q20 7 40 0l-1-19 5 13q1 5 6 4t4-6c-2-15-7-26-18-32" fill={shirt ? 'currentColor' : '#fffefb'} />
    <path d="M48 17c-14-1-23 9-23 24 0 15 9 24 23 24s23-10 23-24-9-25-23-24Z" fill="#fffefb" />
    {seed%4===0 && <path d="M20 27h56M31 26V10h34v16" fill="#fffefb" />}
    {seed%4===1 && <path d="M27 31c7-17 35-18 43 1" strokeWidth="7" />}
    {seed%4===2 ? <path d="M31 36h13v11H31Zm21 0h13v11H52ZM44 40h8" /> : <g fill="currentColor" stroke="none"><ellipse cx="38" cy="40" rx="2.2" ry="3" /><ellipse cx="58" cy="40" rx="2.2" ry="3" /></g>}
    <path d={seed%2 ? 'M41 52q7 7 14 0' : 'M43 54h10'} strokeWidth="2.5" />
  </svg>;
}

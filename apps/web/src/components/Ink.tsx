import { Fragment } from 'react';
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
  let seed = 0; for (const c of value) seed = (seed * 31 + c.codePointAt(0)!) >>> 0;
  const shirt = seed % 3 === 1;
  return <svg aria-hidden="true" viewBox="0 0 44 44" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="avatar-mark">
    <ellipse cx="22" cy="39" rx="9" ry="1.5" fill="currentColor" opacity=".12" stroke="none" />
    <path d="M17 21q-4 4-4 10l3 1 2-5-1 8-1 3h5l1-6 1 6h5l-1-3-1-8 2 5 3-1q0-6-4-10Z" fill={shirt?'currentColor':'#fff'} />
    <circle cx="22" cy="15" r="6.5" fill="#fff" />
    {seed%4===0 && <path d="M14 10h16M17 9V5h10v4" fill="#f4f3ef" />}
    {seed%4===1 && <path d="M15 12q7-7 14 0" strokeWidth="3" />}
    {seed%4===2 && <path d="M17 15h4v3h-4Zm6 0h4v3h-4Zm-2 1h2" />}
    {seed%4!==2 && <path d="M19 16h.2M25 16h.2" strokeWidth="2" />}
    <path d={seed%2?'M20 20q2 2 4 0':'M21 20h2'} />
  </svg>;
}

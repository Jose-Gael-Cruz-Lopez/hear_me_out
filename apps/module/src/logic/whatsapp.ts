// WhatsApp group for the people going to a meetup. No WhatsApp API and no phone numbers: an attendee
// creates the group in WhatsApp ("Invite via link") and pastes the invite here. We validate it and
// generate everything else the group needs: a name, a first message, and a wa.me share link.
// Pure, so the web client can import it as @hmo/module/logic/whatsapp.

/** What WhatsApp's "Invite via link" produces. */
export const WHATSAPP_INVITE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{16,32}$/;

/** WhatsApp caps group names (subjects) at 100 characters. */
export const GROUP_NAME_MAX = 100;

export function normalizeInvite(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function isWhatsAppInvite(url: string): boolean {
  return WHATSAPP_INVITE.test(normalizeInvite(url));
}

export interface MeetupFacts {
  /** "The Taco Lawyers"; may be ''. */
  groupName: string;
  venueTitle: string;
  address: string;
  mapsUrl: string;
  slotLabel: string;
  /** First names of the people going. */
  going: readonly string[];
  icebreakers: readonly string[];
}

/** A name to give the group when creating it in WhatsApp, e.g. "The Taco Lawyers · Tacolicious". */
export function suggestedGroupName(m: Pick<MeetupFacts, 'groupName' | 'venueTitle'>): string {
  const parts = [m.groupName.trim(), m.venueTitle.trim()].filter(Boolean);
  const name = parts.join(' · ') || 'Hear Me Out meetup';
  return name.length > GROUP_NAME_MAX ? `${name.slice(0, GROUP_NAME_MAX - 1).trimEnd()}…` : name;
}

/** The first message to post in the new group, so strangers have something to say. */
export function groupIntro(m: MeetupFacts): string {
  const lines = [
    `👋 Hi ${listNames(m.going)}! We matched on Hear Me Out.`,
    `📍 ${m.venueTitle}${m.address ? `, ${m.address}` : ''}`,
    `🕒 ${m.slotLabel}`,
  ];
  if (m.mapsUrl) lines.push(`🗺️ ${m.mapsUrl}`);
  if (m.icebreakers[0]) lines.push('', `Icebreaker: ${m.icebreakers[0]}`);
  return lines.join('\n');
}

/** Text for sharing the plan + group link with someone going (wa.me lets the sender pick who). */
export function shareText(m: MeetupFacts, inviteUrl: string): string {
  return [`🥊 ${m.venueTitle}, ${m.slotLabel}`, m.address ? `📍 ${m.address}` : '', `💬 Join our WhatsApp group: ${inviteUrl}`].filter(Boolean).join('\n');
}

export function waShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function listNames(names: readonly string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return 'everyone';
  if (n.length === 1) return n[0]!;
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

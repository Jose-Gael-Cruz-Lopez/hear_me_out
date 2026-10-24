import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { isWhatsAppInvite } from '@hmo/module/logic/whatsapp';
import { IconText } from './Ink';
import { useCall, useRoom } from '../lib/room';
import { toast } from '../lib/toast';

/**
 * The WhatsApp group for the people going, in friends games and (once confirmed) public meetups. The server only sends
 * my_group_chat to people who RSVP'd yes, so everyone else gets nothing here. Someone going creates
 * the group and pastes its invite; then everyone going sees a QR code, a join button and a share link.
 */
export function WhatsAppGroup() {
  const { room } = useRoom();
  const [rows] = useTable(tables.myGroupChat);
  const chat = rows.find(r => r.roomId === room.id);
  if (!chat) return null;
  return (
    <div className="card space-y-3 p-5">
      <div className="text-sm font-bold text-muted">WHATSAPP GROUP</div>
      {chat.inviteUrl ? <Invite url={chat.inviteUrl} shareUrl={chat.shareUrl} canEdit={chat.canEdit} /> : chat.canEdit ? <Paste suggestedName={chat.suggestedName} /> : (
        <div className="text-cream/75">Someone going will add the group chat here.</div>
      )}
    </div>
  );
}

function Invite({ url, shareUrl, canEdit }: { url: string; shareUrl: string; canEdit: boolean }) {
  const { room } = useRoom();
  const call = useCall();
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14121a', light: '#ffffff' } })
      .then(s => live && setSvg(s))
      .catch(() => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-3">
      {svg && (
        // The SVG comes from the qrcode library, encoding a link the server already validated.
        <div className="w-44 rounded-2xl bg-white p-2" role="img" aria-label="QR code for the WhatsApp group" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      <div className="text-center text-sm text-cream/75">Scan to join, or tap below.</div>
      <div className="grid w-full grid-cols-2 gap-3">
        <a className="btn btn-lime text-lg" href={url} target="_blank" rel="noreferrer">Join WhatsApp group</a>
        <a className="btn btn-ghost text-lg" href={shareUrl} target="_blank" rel="noreferrer"><IconText text={" 🔗 Share "} /></a>
      </div>
      {canEdit && (
        <button className="chip bg-ink-3 text-cream/70" onClick={() => void call(c => c.reducers.setGroupChatLink({ roomId: room.id, url: '' }))}>
          Remove link
        </button>
      )}
    </div>
  );
}

function Paste({ suggestedName }: { suggestedName: string }) {
  const { room } = useRoom();
  const call = useCall();
  const [link, setLink] = useState('');
  const ok = isWhatsAppInvite(link);
  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(suggestedName);
      toast('Group name copied');
    } catch {
      toast('Could not copy');
    }
  };
  return (
    <div className="space-y-3">
      <div className="text-cream/85">
        Create a group in WhatsApp → Invite via link → paste it here. Everyone going gets a QR code to join.
      </div>
      <button className="chip bg-ink-3 text-cream" onClick={() => void copyName()}>
        Name it: {suggestedName} (copy)
      </button>
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (ok) void call(c => c.reducers.setGroupChatLink({ roomId: room.id, url: link }));
        }}
      >
        <input
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          inputMode="url"
          autoComplete="off"
          aria-label="WhatsApp group invite link"
          className="min-w-0 flex-1 rounded-2xl bg-ink px-4 py-3 ring-2 ring-white/10 outline-none focus:ring-sky"
        />
        <button className="btn btn-lime" disabled={!ok}>Add</button>
      </form>
      {link.trim() && !ok && <div className="text-sm text-tang">That isn't a WhatsApp group invite link.</div>}
    </div>
  );
}

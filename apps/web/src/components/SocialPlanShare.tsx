import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRoom } from '../lib/room';
import { canSharePoster, facebookShareUrl, planShareCaption, preparePlanPoster, type PreparedPlanPoster, type SharePlanDetails } from '../lib/plan-share';
import { DoodleIcon } from './DoodleIcon';
import { useObjectUrl } from './ui';
import './SocialPlanShare.css';

/** Share event details, never private profiles/room links. Every external action requires a tap. */
export function SocialPlanShare({ onTv = false }: { onTv?: boolean }) {
  const { room, plan, rsvps, me, optionById, media } = useRoom();
  const option = plan ? optionById(plan.optionId) : undefined;
  const going = rsvps.find(r => r.playerId === me?.id)?.status === 'yes';
  const eligible = !!plan && !!option && room.mode !== 'queue'
    && (room.mode !== 'strangers' || (going && plan.meetupConfirmed));
  const posterMedia = plan?.posterMediaId ? media.get(plan.posterMediaId) : undefined;
  const storedArt = useObjectUrl(posterMedia?.bytes, posterMedia?.mime);
  const artUrl = plan?.posterPrompt.startsWith('Art-only event cover:') ? storedArt || plan.posterUrl || undefined : undefined;
  const details = useMemo(() => option && plan ? {
    title: option.title,
    slotLabel: plan.slotLabel,
    address: option.address,
    category: option.category,
    mapsUrl: option.mapsUrl,
  } : undefined, [option?.title, option?.address, option?.category, option?.mapsUrl, plan?.slotLabel]);
  if (!plan || !option || !details || room.mode === 'queue') return null;
  // The public host has no participant RSVP; don't expose social export controls there.
  if (onTv) return room.mode === 'strangers' ? null : <div className="social-plan-tv">Share the plan to Instagram or Facebook from your phone.</div>;
  if (!eligible) return <div className="social-plan-hint">{going ? 'Sharing unlocks when 3 people are going.' : 'Tap “I’m in” to unlock sharing.'}</div>;
  // A different event gets fresh interaction state immediately, before a passive effect can run.
  // Image-only updates keep the same child, so a late Muse cover never closes the export tools.
  const eventKey = `${room.id}:${plan.id}:${option.id}:${JSON.stringify(details)}`;
  return <SocialPlanShareActions key={eventKey} details={details} artUrl={artUrl} venueImageUrl={option.imageUrl} />;
}

function SocialPlanShareActions({ details, artUrl, venueImageUrl }: { details: SharePlanDetails; artUrl?: string; venueImageUrl?: string }) {
  const [prepared, setPrepared] = useState<PreparedPlanPoster>();
  const [preparing, setPreparing] = useState(true);
  const [prepareError, setPrepareError] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [panel, setPanel] = useState<'instagram' | 'facebook'>();
  const [sharing, setSharing] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const mounted = useRef(true);
  const interaction = useRef(0);
  const shareRequest = useRef(0);
  const shareBusy = useRef(false);
  const toolsId = useId();
  const caption = planShareCaption(details);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; interaction.current += 1; shareRequest.current += 1; };
  }, []);

  useEffect(() => {
    setPrepared(undefined);
    setPrepareError('');
    const controller = new AbortController();
    setPreparing(true);
    void preparePlanPoster(details, { artUrl, venueImageUrl }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPrepared(value); })
      .catch(() => { if (!controller.signal.aborted) setPrepareError('Couldn’t prepare the poster. You can still copy the invite.'); })
      .finally(() => { if (!controller.signal.aborted) setPreparing(false); });
    return () => controller.abort();
  }, [details, artUrl, venueImageUrl]);

  useEffect(() => {
    if (!prepared) { setDownloadUrl(''); return; }
    const url = URL.createObjectURL(prepared.file);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const native = !!prepared && canSharePoster(prepared.file);
  const copy = async () => {
    const request = ++interaction.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(caption);
      if (!mounted.current || request !== interaction.current) return;
      setManualCopy(false);
      setStatus('Invite copied. Paste it into your post.');
    } catch {
      if (!mounted.current || request !== interaction.current) return;
      setManualCopy(true); setStatus('Select and copy the invite below.');
    }
  };
  const share = async (target: 'instagram' | 'facebook') => {
    if (shareBusy.current) return;
    const request = ++interaction.current;
    setError('');
    setPanel(target);
    if (!prepared || !canSharePoster(prepared.file)) return;
    const ownShare = ++shareRequest.current;
    shareBusy.current = true;
    setSharing(true);
    setStatus(`Choose ${target === 'instagram' ? 'Instagram' : 'Facebook'} in your phone’s share sheet.`);
    try {
      // Do not await image rendering/copying here: share() needs this tap's user activation.
      await navigator.share({ files: [prepared.file], title: details.title, text: caption });
      if (!mounted.current || request !== interaction.current) return;
      setStatus('Share sheet finished. Confirm your post in the app you chose.');
    } catch (reason) {
      if (!mounted.current || request !== interaction.current) return;
      if (reason instanceof Error && reason.name === 'AbortError') setStatus('Sharing cancelled.');
      else { setError('Sharing didn’t open. Save the poster and upload it instead.'); setStatus(''); }
    } finally {
      if (mounted.current && ownShare === shareRequest.current) { shareBusy.current = false; setSharing(false); }
    }
  };

  return <section className="social-plan" aria-label="Share your plan" aria-busy={preparing || sharing}>
    <div className="social-plan-heading">TAKE THE PLAN WITH YOU</div>
    <div className="social-plan-buttons">
      <button type="button" className="btn btn-ghost" disabled={sharing || preparing} aria-expanded={panel === 'instagram' && !sharing} aria-controls={toolsId} onClick={() => void share('instagram')}>
        <DoodleIcon name="camera" size={20} /> Instagram
      </button>
      <button type="button" className="btn btn-ghost" disabled={sharing || preparing} aria-expanded={panel === 'facebook' && !sharing} aria-controls={toolsId} onClick={() => void share('facebook')}>
        <DoodleIcon name="group" size={20} /> Facebook
      </button>
    </div>
    <p className="social-plan-note" role="status">{preparing ? 'Preparing your poster…' : native ? 'Choose the app in your phone’s share sheet. Availability depends on your device.' : 'Save the poster, then upload it in your social app.'}</p>
    {panel && !sharing && <div className="social-plan-tools" id={toolsId}>
      {downloadUrl && prepared && <a className="social-plan-tool" href={downloadUrl} download={prepared.file.name}>
        <DoodleIcon name="ticket" size={18} /> Save poster
      </a>}
      <button type="button" className="social-plan-tool" onClick={() => void copy()}><DoodleIcon name="copy" size={18} /> Copy invite</button>
      <a className="social-plan-tool" href={panel === 'instagram' ? 'https://www.instagram.com/' : facebookShareUrl(details)} target="_blank" rel="noopener noreferrer">
        <DoodleIcon name="arrowUpRight" size={18} /> Open {panel === 'instagram' ? 'Instagram' : 'Facebook'}
      </a>
      <p className="social-plan-note">{panel === 'facebook' ? 'Facebook opens the venue link. Paste the copied invite into your post; attach the saved poster if you like.' : 'Upload the saved poster to a story or post, then paste the invite.'}</p>
      {prepared?.cover === 'Typography' && <p className="social-plan-note">Photo unavailable for export. Your poster keeps the event details.</p>}
    </div>}
    {status && <p className="social-plan-note" role="status">{status}</p>}
    {(error || prepareError) && <p className="social-plan-note social-plan-error" role="alert">{error || prepareError}</p>}
    {manualCopy && <textarea className="m-textarea" aria-label="Invite to copy" readOnly value={caption} onFocus={e => e.currentTarget.select()} />}
  </section>;
}

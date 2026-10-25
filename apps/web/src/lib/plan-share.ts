/** Public event details only: never include a room URL, private profiles or attendee names. */
export interface SharePlanDetails {
  title: string;
  slotLabel: string;
  address: string;
  category: string;
  mapsUrl: string;
}

export function publicVenueUrl(details: Pick<SharePlanDetails, 'mapsUrl' | 'title' | 'address'>): string {
  try {
    const url = new URL(details.mapsUrl);
    const host = url.hostname.toLowerCase();
    const googleMaps = (host === 'google.com' || host === 'www.google.com' || host === 'maps.google.com')
      && (url.pathname.startsWith('/maps') || host === 'maps.google.com');
    const shortMaps = host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps/'));
    if (url.protocol === 'https:' && !url.username && !url.password && (googleMaps || shortMaps)) return url.href;
  } catch { /* Missing/non-public URLs become a public Maps search, never an app-room link. */ }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([details.title, details.address].filter(Boolean).join(', '))}`;
}

export function planShareCaption(details: SharePlanDetails): string {
  return [details.title.trim(), details.slotLabel.trim(), details.address.trim(), publicVenueUrl(details)].filter(Boolean).join('\n');
}

export function facebookShareUrl(details: Pick<SharePlanDetails, 'mapsUrl' | 'title' | 'address'>): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicVenueUrl(details))}`;
}

export function posterFilename(title: string): string {
  const name = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 70);
  return `${name || 'hear-me-out'}-invite.png`;
}

export function canSharePoster(file: File, browser?: Pick<Navigator, 'share' | 'canShare'>): boolean {
  try {
    const target = browser ?? (typeof navigator === 'undefined' ? undefined : navigator);
    return !!target && typeof target.share === 'function' && typeof target.canShare === 'function' && target.canShare({ files: [file] });
  }
  catch { return false; }
}

function loadCover(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // A blocked cross-origin photo must never taint the share canvas.
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => finish(new Error('Cover timed out')), 8_000);
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ''; reject(error); } else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Cover unavailable'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

function linesFor(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  // Splitting long tokens too keeps unusual venue names inside the exported canvas.
  for (const word of text.trim().split(/\s+/)) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxWidth) { lines.push(line); line = ''; }
    for (const char of word) {
      if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
      line += char;
    }
    line += ' ';
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export interface PreparedPlanPoster {
  file: File;
  cover: 'Muse Image' | 'Venue photo' | 'Typography';
}

/** Render early, outside a click handler: Web Share must retain the user's transient activation. */
export async function preparePlanPoster(
  details: SharePlanDetails,
  cover: { artUrl?: string; venueImageUrl?: string },
  signal?: AbortSignal,
): Promise<PreparedPlanPoster> {
  let image: HTMLImageElement | undefined;
  let source: PreparedPlanPoster['cover'] = 'Typography';
  for (const [url, label] of [[cover.artUrl, 'Muse Image'], [cover.venueImageUrl, 'Venue photo']] as const) {
    if (!url) continue;
    try { image = await loadCover(url, signal); source = label; break; }
    catch (error) { if (signal?.aborted) throw error; }
  }
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Poster export is unavailable in this browser.');
  ctx.fillStyle = '#f4f3ef';
  ctx.fillRect(0, 0, 1080, 1080);
  if (image) {
    const scale = Math.max(1080 / image.naturalWidth, 650 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1080, 650); ctx.clip();
    ctx.drawImage(image, (1080 - width) / 2, (650 - height) / 2, width, height);
    ctx.restore();
  }
  ctx.fillStyle = '#14140f';
  ctx.font = '700 23px system-ui, sans-serif';
  ctx.fillText('HEAR ME OUT  /  YOU’RE INVITED', 64, image ? 710 : 120);
  let size = image ? 74 : 104;
  let titleLines: string[] = [];
  do {
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    titleLines = linesFor(ctx, details.title || 'It’s a plan', 952);
    if (titleLines.length <= 3 && (!image || titleLines.length * size * 1.08 <= 160)) break;
    size -= 4;
  } while (size > 30);
  const shown = titleLines.slice(0, 3);
  if (titleLines.length > 3) shown[2] = `${shown[2]!.slice(0, -2)}…`;
  let y = image ? 790 : 310;
  for (const line of shown) { ctx.fillText(line.trim(), 64, y); y += size * 1.08; }
  y = Math.max(y + 20, image ? 950 : 740);
  ctx.font = '600 30px system-ui, sans-serif';
  // Dates are accurate app typography, not model-rendered lettering.
  const timeLines = linesFor(ctx, details.slotLabel, 952).slice(0, 2);
  for (const line of timeLines) { ctx.fillText(line.trim(), 64, y); y += 38; }
  ctx.font = '500 21px system-ui, sans-serif';
  ctx.fillStyle = '#62615a';
  ctx.fillText((details.category || 'The plan').slice(0, 60), 64, 1040);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not export poster.')), 'image/png'));
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return { file: new File([blob], posterFilename(details.title), { type: 'image/png' }), cover: source };
}

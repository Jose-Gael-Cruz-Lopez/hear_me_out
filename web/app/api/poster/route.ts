import { withFallback, type Poster } from '@/lib/ai/muse';

// Posters are generated once per (name, category) and kept in memory for the server's lifetime.
const cache = new Map<string, Promise<Poster>>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = (url.searchParams.get('name') ?? 'Mystery Spot').slice(0, 80);
  const category = (url.searchParams.get('category') ?? '').slice(0, 40);
  const blurb = (url.searchParams.get('blurb') ?? '').slice(0, 200);
  const key = `${name}|${category}`;
  let poster = cache.get(key);
  if (!poster) {
    poster = withFallback('poster', ai => ai.poster({ name, category, blurb }), 30_000).then(r => r.value);
    cache.set(key, poster);
    poster.catch(() => cache.delete(key));
  }
  const p = await poster;
  return new Response(p.body as BodyInit, {
    headers: { 'Content-Type': p.contentType, 'Cache-Control': 'public, max-age=86400' },
  });
}

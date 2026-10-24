import { readFileSync } from 'node:fs';
import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { SCRAPER_ACTORS, enrich, normalizePosts, profileHandles, type NormalizedPost } from './core.js';
import { buildMuseRequest, createMuseTagger, museVibeTags, parseMuseVibeTags, redactForModel, type ChatClient } from './muse.js';

const items = JSON.parse(readFileSync(new URL('../test/fixtures/synthetic-foodie-instagram.json', import.meta.url), 'utf8')).items;
const posts: NormalizedPost[] = normalizePosts('instagram', 'example.foodie', items);
const enrichment = enrich(posts, { timeZone: 'America/Los_Angeles' });

const reply = (content: string): OpenAI.Chat.ChatCompletion =>
  ({
    id: 'x',
    object: 'chat.completion',
    created: 0,
    model: 'muse-spark-1.3',
    choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content, refusal: null } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }) as OpenAI.Chat.ChatCompletion;

function fakeClient(...responses: (string | Error)[]) {
  const create = vi.fn(async (_body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, _opts?: { timeout?: number }) => {
    const next = responses.shift();
    if (next === undefined) throw new Error('no more fake responses');
    if (next instanceof Error) throw next;
    return reply(next);
  });
  const client: ChatClient = { chat: { completions: { create } } };
  return { client, create };
}

const GOOD = JSON.stringify({
  vibeTags: [
    { tag: 'ramen-hunter', reason: 'keeps chasing ramen spots', evidencePostIndices: [0, 5] },
    { tag: 'Late Night Eats', reason: 'eats after 10pm', evidencePostIndices: [0, 1, 2] },
  ],
});

describe('buildMuseRequest', () => {
  it('sends rules as a developer message, a JSON schema reply format and low reasoning effort', () => {
    const req = buildMuseRequest(posts, enrichment);
    expect(req.model).toBe('muse-spark-1.3');
    expect(req.reasoning_effort).toBe('low');
    expect(req.messages[0].role).toBe('developer');
    expect(String(req.messages[0].content)).toMatch(/Never infer or mention sensitive traits/);
    expect(req.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'vibe_tags', strict: false } });
    const schema = (req.response_format as { json_schema: { schema: Record<string, any> } }).json_schema.schema;
    expect(schema.properties.vibeTags.maxItems).toBe(8);
    expect(schema.$schema).toBeUndefined();

    const user = JSON.parse(String(req.messages[1].content));
    expect(user.posts).toHaveLength(10);
    expect(user.posts[0]).toMatchObject({ i: 0, platform: 'instagram', location: 'Example Ramen House', localHour: 23 });
    expect(user.signals.postingPattern).toBe('night-owl');
  });

  it('honours model, effort and maxPosts overrides', () => {
    const req = buildMuseRequest(posts, enrichment, { model: 'muse-spark-2', reasoningEffort: 'minimal', maxPosts: 3 });
    expect(req.model).toBe('muse-spark-2');
    expect(req.reasoning_effort).toBe('minimal');
    expect(JSON.parse(String(req.messages[1].content)).posts).toHaveLength(3);
  });

  it('strips links and @mentions before text leaves the run', () => {
    expect(redactForModel('Dinner with @some.friend at https://example.com/x  yum')).toBe('Dinner with @someone at [link] yum');
    expect(redactForModel('mail me a@b.com')).toBe('mail me a@b.com');
  });
});

describe('parseMuseVibeTags', () => {
  it('validates and sanitizes a good reply', () => {
    expect(parseMuseVibeTags(GOOD, 10)).toEqual({
      tags: [
        { tag: 'ramen-hunter', reason: 'keeps chasing ramen spots', evidencePostIndices: [0, 5] },
        { tag: 'late-night-eats', reason: 'eats after 10pm', evidencePostIndices: [0, 1, 2] },
      ],
    });
    expect('tags' in parseMuseVibeTags('```json\n' + GOOD + '\n```', 10)).toBe(true);
  });

  it('drops sensitive tags and out-of-range evidence', () => {
    const r = parseMuseVibeTags(
      JSON.stringify({
        vibeTags: [
          { tag: 'vegan', reason: 'diet', evidencePostIndices: [8] },
          { tag: 'devout-christian', reason: 'religion', evidencePostIndices: [9] },
          { tag: 'karaoke-star', reason: 'sings late', evidencePostIndices: [6, 40] },
          { tag: 'ghost', reason: 'cites nothing real', evidencePostIndices: [99] },
        ],
      }),
      10
    );
    expect(r).toEqual({ tags: [{ tag: 'karaoke-star', reason: 'sings late', evidencePostIndices: [6] }] });
  });

  it('returns an error for unusable replies', () => {
    expect(parseMuseVibeTags('', 10)).toEqual({ error: 'empty reply' });
    expect(parseMuseVibeTags('not json', 10)).toMatchObject({ error: expect.stringContaining('not valid JSON') });
    expect(parseMuseVibeTags(JSON.stringify({ tags: [] }), 10)).toHaveProperty('error');
    expect(parseMuseVibeTags(JSON.stringify({ vibeTags: [{ tag: 'politics', reason: 'x', evidencePostIndices: [0] }] }), 10)).toHaveProperty('error');
  });
});

describe('museVibeTags', () => {
  it('returns tags from a valid first reply', async () => {
    const { client, create } = fakeClient(GOOD);
    const log = vi.fn();
    const tags = await museVibeTags(posts, enrichment, { apiKey: 'k', client, timeoutMs: 1234, log });
    expect(tags?.map(t => t.tag)).toEqual(['ramen-hunter', 'late-night-eats']);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toEqual({ timeout: 1234 });
    expect(log).toHaveBeenCalledWith('info', 'muse vibe tags', expect.objectContaining({ tokens: 20, attempt: 1 }));
  });

  it('retries once with the validation error, then succeeds', async () => {
    const { client, create } = fakeClient('{"oops": true}', GOOD);
    const tags = await museVibeTags(posts, enrichment, { apiKey: 'k', client });
    expect(tags).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = create.mock.calls[1][0].messages;
    expect(retryMessages).toHaveLength(4);
    expect(retryMessages[2]).toEqual({ role: 'assistant', content: '{"oops": true}' });
    expect(String(retryMessages[3].content)).toMatch(/did not validate/);
  });

  it('returns null after two bad replies or two errors', async () => {
    expect(await museVibeTags(posts, enrichment, { apiKey: 'k', client: fakeClient('nope', 'still nope').client })).toBeNull();
    const failing = fakeClient(new Error('ETIMEDOUT'), new Error('ETIMEDOUT'));
    expect(await museVibeTags(posts, enrichment, { apiKey: 'k', client: failing.client })).toBeNull();
    expect(failing.create).toHaveBeenCalledTimes(2);
  });

  it('skips the call without posts or credentials', async () => {
    const { client, create } = fakeClient(GOOD);
    expect(await museVibeTags([], enrichment, { apiKey: 'k', client })).toBeNull();
    expect(await museVibeTags(posts, enrichment, { apiKey: '' })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('plugs into profileHandles through createMuseTagger', async () => {
    const { client } = fakeClient(GOOD);
    const callActor = vi.fn(async (id: string) => (id === SCRAPER_ACTORS.instagram ? items : []));
    const result = await profileHandles({ instagramHandles: ['example.foodie'] }, { callActor, muse: createMuseTagger({ apiKey: 'k', client }) });
    expect(result.profiles[0]).toMatchObject({ vibeTagsSource: 'muse', tags: ['ramen-hunter', 'late-night-eats'] });
    expect(result.merged.tags).toEqual(['ramen-hunter', 'late-night-eats']);
  });

  it('falls back to heuristic tags end to end when Muse keeps failing', async () => {
    const { client } = fakeClient(new Error('500'), new Error('500'));
    const callActor = vi.fn(async (id: string) => (id === SCRAPER_ACTORS.instagram ? items : []));
    const result = await profileHandles(
      { instagramHandles: ['example.foodie'], timeZone: 'America/Los_Angeles' },
      { callActor, muse: createMuseTagger({ apiKey: 'k', client }) }
    );
    expect(result.profiles[0].vibeTagsSource).toBe('heuristic');
    expect(result.profiles[0].tags).toContain('night-owl');
  });
});

/**
 * Muse Spark (Meta Model API) vibe tagger, shared by the actor and the Hear Me Out orchestrator.
 *
 * OpenAI-compatible endpoint (https://api.meta.ai/v1, POST /chat/completions) via the official `openai` SDK.
 * Structured output with a JSON schema, standing rules in a developer message, zod validation,
 * one retry carrying the validation error, and `null` on any failure so callers fall back to the
 * deterministic tags.
 */
import OpenAI from 'openai';
import { z } from 'zod';
import {
  DEFAULT_MUSE_MODEL,
  MAX_VIBE_TAGS,
  sanitizeVibeTags,
  type Enrichment,
  type LogFn,
  type MuseTagger,
  type NormalizedPost,
  type VibeTag,
} from './core.js';

export const MUSE_BASE_URL = 'https://api.meta.ai/v1';
export const DEFAULT_MUSE_TIMEOUT_MS = 25_000;
/** Posts sent to Muse per call (merged profiles can be larger). */
export const DEFAULT_MUSE_MAX_POSTS = 60;
const MAX_TEXT_CHARS = 300;

/** Wire schema: sent to Muse as the JSON schema of the reply. */
export const MuseVibeTagsSchema = z.object({
  vibeTags: z
    .array(
      z.object({
        tag: z.string().min(1).max(40).describe('kebab-case, 1-3 words, e.g. spicy-food'),
        reason: z.string().min(1).max(160).describe('short "because..." line, max ~12 words'),
        evidencePostIndices: z.array(z.number().int().min(0)).min(1).max(8).describe('the "i" of each supporting post'),
      })
    )
    .max(MAX_VIBE_TAGS),
});
export type MuseVibeTagsResponse = z.infer<typeof MuseVibeTagsSchema>;

/**
 * Validation schema: the same shape, but lenient where `sanitizeVibeTags` can repair the reply
 * (extra tags are cut, long strings trimmed, tags without valid evidence dropped).
 */
const MuseVibeTagsParseSchema = z.object({
  vibeTags: z
    .array(
      z.object({
        tag: z.string().min(1).max(80),
        reason: z.string().max(400),
        evidencePostIndices: z.array(z.number().int()),
      })
    )
    .max(20),
});

export const MUSE_VIBE_RULES = [
  'You turn a person\'s own public social posts (shared with their consent) into short taste tags that help a group of friends plan an outing: food, drinks, activities, music, movies, outdoors, and when they like to go out.',
  `Return at most ${MAX_VIBE_TAGS} tags. Each tag is lowercase kebab-case, 1-3 words (e.g. spicy-food, board-games, night-owl, live-music, coffee-snob, ramen).`,
  'Each tag needs a short reason (max 12 words) and evidencePostIndices: the "i" values of the posts that support it. Cite at least one post per tag.',
  'Use only what the posts and signals show. Prefer specific, plannable tastes (cuisines, activities, venue types, times of day) over generic ones. Skip brand names and sponsorships.',
  'Never infer or mention sensitive traits: health or medical conditions, religion, sexuality or gender identity, politics, ethnicity or race, or dietary restrictions (diet is only what a person states themself). Ignore posts about those topics.',
  'Do not name or describe other people. Reply only with JSON that matches the schema.',
].join('\n');

/** The minimal slice of the OpenAI client this module uses (lets tests inject a fake). */
export interface ChatClient {
  chat: {
    completions: {
      create(
        body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        options?: { timeout?: number; signal?: AbortSignal }
      ): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface MuseVibeOptions {
  apiKey: string;
  /** Default muse-spark-1.3. */
  model?: string;
  /** Default https://api.meta.ai/v1. */
  baseURL?: string;
  /** Per attempt. Default 25 s. */
  timeoutMs?: number;
  maxPosts?: number;
  reasoningEffort?: ReasoningEffort;
  /** Inject a client (tests, or a shared orchestrator client). */
  client?: ChatClient;
  log?: LogFn;
}

const MUSE_JSON_SCHEMA = (() => {
  const s = z.toJSONSchema(MuseVibeTagsSchema, { target: 'draft-7' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
})();

/** Removes links and @mentions before posts leave the run (less personal data sent to the model). */
export function redactForModel(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/(^|[^\w])@[\w.]{2,}/g, '$1@someone')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/** Builds the compact model input: indexed posts plus the deterministic signals. */
export function buildMuseInput(posts: readonly NormalizedPost[], enrichment: Enrichment, maxPosts = DEFAULT_MUSE_MAX_POSTS) {
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: enrichment.timeZone, hour: 'numeric', hourCycle: 'h23' });
  return {
    posts: posts.slice(0, maxPosts).map((p, i) => ({
      i,
      platform: p.platform,
      text: redactForModel(p.text),
      ...(p.altText ? { imageDescription: redactForModel(p.altText).slice(0, 160) } : {}),
      hashtags: p.hashtags.slice(0, 15),
      ...(p.locationName ? { location: p.locationName } : {}),
      mediaType: p.mediaType,
      ...(p.timestamp ? { localHour: Number(hourFmt.formatToParts(new Date(p.timestamp)).find(x => x.type === 'hour')?.value ?? NaN) % 24 } : {}),
    })),
    signals: {
      postCount: enrichment.postCount,
      timeZone: enrichment.timeZone,
      postingPattern: enrichment.postingPattern,
      postingHours: enrichment.postingHours,
      topHashtags: enrichment.topHashtags.slice(0, 10),
      topLocations: enrichment.topLocations.slice(0, 5),
      interests: enrichment.interests.map(h => ({ interest: h.interest, share: h.share })),
      subInterests: enrichment.subInterests.map(h => ({ interest: h.interest, share: h.share })),
    },
  };
}

export function buildMuseRequest(
  posts: readonly NormalizedPost[],
  enrichment: Enrichment,
  opts: Pick<MuseVibeOptions, 'model' | 'maxPosts' | 'reasoningEffort'> = {}
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  return {
    model: opts.model || DEFAULT_MUSE_MODEL,
    messages: [
      { role: 'developer', content: MUSE_VIBE_RULES },
      { role: 'user', content: JSON.stringify(buildMuseInput(posts, enrichment, opts.maxPosts)) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'vibe_tags', schema: MUSE_JSON_SCHEMA, strict: false },
    },
    reasoning_effort: opts.reasoningEffort ?? 'low',
  };
}

/**
 * Parses and validates a Muse reply. Returns sanitized tags (kebab-case, no sensitive traits,
 * evidence indices within range) or an error message for the retry.
 */
export function parseMuseVibeTags(content: string | null | undefined, postCount: number): { tags: VibeTag[] } | { error: string } {
  if (!content || !content.trim()) return { error: 'empty reply' };
  let json: unknown;
  try {
    json = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (err) {
    return { error: `not valid JSON: ${String(err).slice(0, 200)}` };
  }
  const parsed = MuseVibeTagsParseSchema.safeParse(json);
  if (!parsed.success) return { error: parsed.error.message.slice(0, 800) };
  const tags = sanitizeVibeTags(parsed.data.vibeTags, postCount, { requireEvidence: true });
  if (tags.length === 0) return { error: 'no usable tags: each tag must cite at least one valid post index "i"' };
  return { tags };
}

export function createMuseClient(opts: Pick<MuseVibeOptions, 'apiKey' | 'baseURL'>): ChatClient {
  return new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL || MUSE_BASE_URL, maxRetries: 0 });
}

/** One Muse Spark call (plus one retry). Resolves null on any failure; never throws. */
export async function museVibeTags(
  posts: readonly NormalizedPost[],
  enrichment: Enrichment,
  opts: MuseVibeOptions
): Promise<VibeTag[] | null> {
  if (posts.length === 0) return null;
  if (!opts.apiKey && !opts.client) return null;
  const client = opts.client ?? createMuseClient(opts);
  const request = buildMuseRequest(posts, enrichment, opts);
  const sentPosts = Math.min(posts.length, opts.maxPosts ?? DEFAULT_MUSE_MAX_POSTS);
  const messages = [...request.messages];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const res = await client.chat.completions.create({ ...request, messages }, { timeout: opts.timeoutMs ?? DEFAULT_MUSE_TIMEOUT_MS });
      const content = res.choices?.[0]?.message?.content ?? '';
      opts.log?.('info', 'muse vibe tags', {
        model: request.model,
        attempt,
        ms: Date.now() - started,
        tokens: res.usage?.total_tokens ?? null,
      });
      const result = parseMuseVibeTags(content, sentPosts);
      if ('tags' in result) return result.tags;
      opts.log?.('warn', 'muse reply did not validate', { attempt, error: result.error.slice(0, 200) });
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: `That JSON did not validate: ${result.error}. Reply again with corrected JSON only.` });
    } catch (err) {
      opts.log?.('warn', 'muse call failed', { attempt, error: String(err).slice(0, 200) });
    }
  }
  return null;
}

/** Adapter for `profileHandles(input, { muse })`. */
export function createMuseTagger(opts: MuseVibeOptions): MuseTagger {
  const client = opts.client ?? createMuseClient(opts);
  return (posts, enrichment) => museVibeTags(posts, enrichment, { ...opts, client });
}

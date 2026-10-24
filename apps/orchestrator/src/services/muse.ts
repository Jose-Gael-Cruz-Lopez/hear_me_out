import OpenAI from 'openai';
import { z } from 'zod';
import type { Config } from '../config';
import { log } from '../log';
import { safeCoverArtPrompt } from './cover-art';

export type Effort = 'minimal' | 'low' | 'medium' | 'high';

/** Tone and standing rules shared by every prompt (sent as the developer message). */
export const JUDGE_RULES = [
  'You are "The Judge", the host of Hear Me Out: a witty, warm game-show judge helping a group pick a real plan.',
  'Be playful and inclusive. Never mock a person, their body, identity, diet or budget.',
  'Never make things up about venues: only use the venue data you are given, and say "unknown" when a fact is missing.',
  'Keep every line short and punchy. Reply only with JSON that matches the schema.',
].join('\n');

export interface Muse {
  readonly enabled: boolean;
  json<T>(req: JsonRequest<T>): Promise<T | null>;
  image(prompt: string, roomId: bigint): Promise<{ bytes: Buffer; mime: string } | null>;
  transcribe(wav: Buffer, roomId: bigint): Promise<string | null>;
  callsFor(roomId: bigint): number;
}

export interface JsonRequest<T> {
  name: string;
  /** Prompt-specific instructions, appended to JUDGE_RULES in the developer message. */
  instructions: string;
  input: unknown;
  schema: z.ZodType<T>;
  effort?: Effort;
  timeoutMs?: number;
  roomId: bigint;
}

/** Muse sometimes adds markdown emphasis; our UI renders plain text, so strip it from every string. */
function stripMarkdown<T>(v: T): T {
  if (typeof v === 'string') return v.replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '') as T;
  if (Array.isArray(v)) return v.map(stripMarkdown) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripMarkdown(x)])) as T;
  return v;
}

function stringify(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
}

export function createMuse(cfg: Config): Muse {
  const enabled = cfg.museEnabled;
  const client = enabled ? new OpenAI({ apiKey: cfg.metaApiKey, baseURL: cfg.museBaseUrl, maxRetries: 0 }) : null;
  const calls = new Map<string, number>();
  let totalTokens = 0;

  function budgetOk(roomId: bigint): boolean {
    const key = roomId.toString();
    const n = calls.get(key) ?? 0;
    if (n >= cfg.maxMuseCallsPerRoom) {
      log.warn('Muse call cap reached for room, using fallbacks', { roomId, calls: n });
      return false;
    }
    calls.set(key, n + 1);
    return true;
  }

  async function json<T>(req: JsonRequest<T>): Promise<T | null> {
    if (!client || !budgetOk(req.roomId)) return null;
    const jsonSchema = z.toJSONSchema(req.schema, { target: 'draft-7' }) as Record<string, unknown>;
    delete jsonSchema.$schema;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'developer', content: `${JUDGE_RULES}\n\n${req.instructions}` },
      { role: 'user', content: stringify(req.input) },
    ];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      try {
        const res = await client.chat.completions.create(
          {
            model: cfg.museModel,
            messages,
            response_format: { type: 'json_schema', json_schema: { name: req.name, schema: jsonSchema, strict: false } },
            reasoning_effort: req.effort ?? 'low',
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
          { timeout: req.timeoutMs ?? 20_000 }
        );
        totalTokens += res.usage?.total_tokens ?? 0;
        log.info('muse', {
          prompt: req.name,
          attempt,
          ms: Date.now() - started,
          tokens: res.usage?.total_tokens ?? '?',
          cached: (res.usage as { prompt_tokens_details?: { cached_tokens?: number } })?.prompt_tokens_details?.cached_tokens ?? 0,
          total: totalTokens,
        });
        const content = res.choices[0]?.message?.content ?? '';
        const parsed = req.schema.safeParse(stripMarkdown(JSON.parse(content)));
        if (parsed.success) return parsed.data;
        // Retry once with the validation error appended, as the spec asks.
        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: `That JSON did not validate: ${parsed.error.message.slice(0, 800)}. Reply again with corrected JSON only.` });
      } catch (err) {
        log.warn('muse call failed', { prompt: req.name, attempt, err: String(err).slice(0, 200) });
        if (attempt === 2) return null;
      }
    }
    return null;
  }

  async function image(prompt: string, roomId: bigint): Promise<{ bytes: Buffer; mime: string } | null> {
    if (!client || !budgetOk(roomId)) return null;
    const started = Date.now();
    try {
      const res = await client.images.generate(
        {
          model: cfg.museImageModel,
          prompt: safeCoverArtPrompt(prompt),
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
          output_format: 'jpeg',
        } as OpenAI.Images.ImageGenerateParams,
        { timeout: 60_000 }
      );
      const b64 = (res as OpenAI.Images.ImagesResponse).data?.[0]?.b64_json;
      log.info('muse image', { ms: Date.now() - started, ok: !!b64 });
      return b64 ? { bytes: Buffer.from(b64, 'base64'), mime: 'image/jpeg' } : null;
    } catch (err) {
      log.warn('muse image failed', { err: String(err).slice(0, 200) });
      return null;
    }
  }

  async function transcribe(wav: Buffer, roomId: bigint): Promise<string | null> {
    if (!enabled || !budgetOk(roomId)) return null;
    const started = Date.now();
    try {
      const form = new FormData();
      form.append(
        'request',
        new Blob([JSON.stringify({ model: cfg.museVoiceModel, audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })], { type: 'application/json' })
      );
      form.append('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'pitch.wav');
      const res = await fetch(`${cfg.museBaseUrl}/asr/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.metaApiKey}`, Accept: 'application/json' },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { transcript?: string; turns?: { transcript?: string }[] };
      const text = body.transcript?.trim() || (body.turns ?? []).map(t => t.transcript ?? '').join(' ').trim();
      log.info('muse transcribe', { ms: Date.now() - started, chars: text.length });
      return text || null;
    } catch (err) {
      log.warn('muse transcribe failed', { err: String(err).slice(0, 200) });
      return null;
    }
  }

  return {
    enabled,
    json,
    image,
    transcribe,
    callsFor: roomId => calls.get(roomId.toString()) ?? 0,
  };
}

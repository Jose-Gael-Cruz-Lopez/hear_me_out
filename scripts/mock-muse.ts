// A strict local stand-in for the Meta Model API, used by `pnpm sim --mock-muse` to exercise every Muse
// code path without a key. It validates request shapes against Meta's docs (developer message,
// json_schema response_format, reasoning_effort, multipart ASR with a 24 kHz mono WAV) and returns
// schema-valid answers. It is a test double only: nothing it returns is presented as real AI output.
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

// 1x1 white JPEG.
const TINY_JPEG =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

export interface MockStats {
  chat: Record<string, number>;
  images: number;
  asr: number;
  violations: string[];
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

type Input = Record<string, any>;

function answer(name: string, input: Input): unknown {
  switch (name) {
    case 'distill_profile':
      return { tags: [{ tag: 'mock-spicy-food', reason: 'You picked spicy (mock Muse)', source: 'chips' }, { tag: 'board-games', reason: 'Your Muse summary says so', source: 'paste' }] };
    case 'warmup':
      return { questions: (input.players ?? []).map((p: Input) => ({ playerId: p.playerId, question: `Mock hot take for ${p.name}?`, choiceA: 'Yes', choiceB: 'No' })) };
    case 'curate':
      return {
        finalists: (input.candidates ?? []).slice(0, input.n).map((c: Input, i: number) => ({
          placeId: c.placeId,
          fitSummary: `Mock Muse summary #${i + 1}`,
          groupFitScore: 70 + i,
          perPlayerFit: (input.players ?? []).map((p: Input) => ({ playerId: p.playerId, line: `${p.name}: mock fit line` })),
        })),
      };
    case 'assign':
      return { briefs: (input.assignments ?? []).map((a: Input) => ({ playerId: a.playerId, stylePrompt: `Defend ${a.option.title} like a mock Muse persona.`, hints: ['Mock hint one', 'Mock hint two', 'Mock hint three'] })) };
    case 'factcheck':
      return /2\s*am/i.test(input.transcript ?? '')
        ? { kind: 'sustained', text: 'OBJECTION SUSTAINED (mock Muse): it does not stay open that late.' }
        : { kind: 'none', text: '' };
    case 'awards': {
      const first = (input.transcripts ?? [])[0];
      return { playerId: first?.playerId ?? '0', quote: (first?.transcript ?? 'Mock line').split(/[.!?]/)[0].split(' ').slice(0, 10).join(' ') };
    }
    case 'plan_copy':
      return {
        inviteText: `Mock Muse invite: ${input.venue?.title} at ${input.time}!`,
        whyForEach: (input.players ?? []).map((p: Input) => ({ playerId: p.playerId, line: `${p.name}: mock reason` })),
        posterPrompt: 'Mock poster prompt',
        icebreakers: ['Mock icebreaker 1', 'Mock icebreaker 2', 'Mock icebreaker 3'],
      };
    case 'bot_pitch':
      return { pitches: (input.pitches ?? []).map((p: Input) => ({ pitchId: p.pitchId, text: `Mock Muse pitch from ${p.botName}: ${p.venue?.title} has ${p.venue?.rating} stars. Vote for it!` })) };
    case 'match_blurb':
      return { line: 'Mock Muse: you would vibe.' };
    case 'merge_intro':
      return { text: 'Mock Muse intro for both groups.' };
    case 'scout_queries':
      return { queries: ['ramen', 'tacos'] };
    default:
      return {};
  }
}

export async function startMockMuse(): Promise<{ baseUrl: string; stats: MockStats; close(): void }> {
  const stats: MockStats = { chat: {}, images: 0, asr: 0, violations: [] };
  const fail = (msg: string) => {
    stats.violations.push(msg);
    return msg;
  };

  const server = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.headers.authorization !== 'Bearer mock-key') return send(401, { error: { message: fail('missing bearer auth') } });
      const body = await readBody(req);

      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        const r = JSON.parse(body.toString());
        const name = r.response_format?.json_schema?.name;
        if (r.response_format?.type !== 'json_schema' || !name || !r.response_format.json_schema.schema) return send(400, { error: { message: fail(`${name}: response_format must be json_schema`) } });
        if (r.messages?.[0]?.role !== 'developer') return send(400, { error: { message: fail(`${name}: first message should be the developer message`) } });
        if (!['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(r.reasoning_effort)) return send(400, { error: { message: fail(`${name}: bad reasoning_effort ${r.reasoning_effort}`) } });
        if (!r.model) return send(400, { error: { message: fail(`${name}: missing model`) } });
        stats.chat[name] = (stats.chat[name] ?? 0) + 1;
        const input = JSON.parse(r.messages[1]?.content ?? '{}');
        return send(200, {
          id: 'mock',
          object: 'chat.completion',
          model: r.model,
          created: Math.floor(Date.now() / 1000),
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer(name, input)) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        });
      }

      if (req.url === '/v1/images/generations' && req.method === 'POST') {
        const r = JSON.parse(body.toString());
        if (!r.prompt || !r.model) return send(400, { error: { message: fail('image: missing prompt/model') } });
        stats.images++;
        return send(200, { created: Math.floor(Date.now() / 1000), data: [{ b64_json: TINY_JPEG }], output_format: r.output_format ?? 'webp' });
      }

      if (req.url?.startsWith('/v1/asr/transcribe') && req.method === 'POST') {
        const raw = body.toString('latin1');
        const reqPart = raw.match(/name="request"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/);
        const settings = reqPart ? JSON.parse(reqPart[1]) : null;
        if (!settings?.model || settings.audioEncoding !== 'WAV') return send(400, { error: { message: fail('asr: request part must carry model + audioEncoding WAV') } });
        const audioAt = raw.indexOf('name="audio"');
        const riff = audioAt >= 0 ? raw.indexOf('RIFF', audioAt) : -1;
        if (riff < 0) return send(400, { error: { message: fail('asr: audio part is not a WAV') } });
        const wav = body.subarray(riff);
        if (wav.readUInt16LE(22) !== 1 || ![16000, 24000].includes(wav.readUInt32LE(24)) || wav.readUInt16LE(34) !== 16) return send(400, { error: { message: fail('asr: WAV must be mono 16-bit PCM at 16 or 24 kHz') } });
        stats.asr++;
        return send(200, { sessionId: 'mock', transcript: 'Mock Muse transcript: it is cheap and only a 2 minute walk.', audioDurationMs: 6500, turns: [] });
      }

      return send(404, { error: { message: fail(`unexpected ${req.method} ${req.url}`) } });
    } catch (err) {
      return send(500, { error: { message: fail(`mock crashed: ${String(err)}`) } });
    }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/v1`, stats, close: () => server.close() };
}

// pnpm demo:player <CODE> <Name> [audio.webm] — a scripted player for testing a real room from the terminal.
// Joins during the lobby, plays every phase, and pitches with the given recording (or a typed pitch).
import { readFileSync } from 'node:fs';
import { autopilot, connect, t, waitFor } from './simlib';

const [code, name = 'Leo', audio] = process.argv.slice(2);
if (!code) throw new Error('usage: pnpm demo:player <CODE> <Name> [audio.webm]');
const conn = await connect(name);
await conn.reducers.joinRoom({ code, name, avatar: '🎤' });
const room = await waitFor('room', () => [...conn.db.room.iter()].find(r => r.code === code.toUpperCase()));
console.log(`${t()}  ${name} joined ${room.code}`);
const pitchAudio = audio ? { bytes: new Uint8Array(readFileSync(audio)), mime: audio.endsWith('.webm') ? 'audio/webm' : 'audio/mp4', durationMs: 8000 } : undefined;
autopilot(conn, name, () => room.id, { rsvp: 'yes', pitchAudio });
await waitFor('plan', () => conn.db.room.id.find(room.id)?.phase === 'plan', 15 * 60_000);
const pitch = [...conn.db.pitch.iter()].find(p => p.roomId === room.id && p.playerId === [...conn.db.player.iter()].find(x => x.roomId === room.id && x.name === name)?.id);
console.log(`${t()}  ${name}'s pitch: [${pitch?.transcriptSource}] ${pitch?.transcript} → ${pitch?.rulingKind}: ${pitch?.rulingText}`);
process.exit(0);

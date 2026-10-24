import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

/**
 * Browser recordings (Chrome: audio/webm, Safari: audio/mp4) -> mono 16-bit PCM WAV at 24 kHz,
 * the format Muse Voice Transcribe expects. Uses temp files because MP4 cannot be read from a pipe.
 */
export async function toWav(input: Uint8Array, mime: string, timeoutMs = 20_000): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('ffmpeg-static binary not found');
  const dir = await mkdtemp(join(tmpdir(), 'hmo-audio-'));
  const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('aif') ? 'aiff' : 'webm';
  const inFile = join(dir, `in.${ext}`);
  const outFile = join(dir, 'out.wav');
  try {
    await writeFile(inFile, input);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as unknown as string, ['-y', '-i', inFile, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-map_metadata', '-1', outFile], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      proc.stderr.on('data', d => (stderr += String(d)));
      const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
      proc.on('error', reject);
      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      });
    });
    return await readFile(outFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

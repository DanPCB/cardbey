/**
 * Mux voiceover + optional ducked music into mp4 (-c:v copy).
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createTempPath, safeUnlink } from '../../tempFiles.js';
import { initializeVideoFfmpeg } from '../../videoCompat.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {{
 *   videoPath: string,
 *   voiceoverPath: string,
 *   musicPath?: string | null,
 *   musicDuckDb?: number,
 * }} opts
 * @returns {Promise<{ ok: boolean, outputPath?: string, publicPath?: string, error?: string }>}
 */
export async function muxAudioIntoVideo(opts) {
  const videoPath = String(opts.videoPath ?? '').trim();
  const voicePath = String(opts.voiceoverPath ?? '').trim();
  if (!videoPath || !voicePath) {
    return { ok: false, error: 'missing_inputs' };
  }

  await initializeVideoFfmpeg();
  const { default: ffmpegStatic } = await import('ffmpeg-static');

  const outLocal = createTempPath('cardbey-mux-', '.mp4');
  const musicPath = opts.musicPath ? String(opts.musicPath).trim() : '';
  const duckDb = typeof opts.musicDuckDb === 'number' ? opts.musicDuckDb : -14;
  const musicVol = Math.pow(10, duckDb / 20);

  const args = ['-y', '-i', videoPath, '-i', voicePath];
  let filterComplex;
  let mapAudio = '[aout]';

  if (musicPath && fs.existsSync(musicPath)) {
    args.push('-i', musicPath);
    filterComplex = `[2:a]volume=${musicVol}[mb];[1:a][mb]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
  } else {
    filterComplex = `[1:a]anull[aout]`;
  }

  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    '0:v:0',
    '-map',
    mapAudio,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outLocal,
  );

  try {
    await runFfmpeg(ffmpegStatic, args);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${Date.now()}-mux-${path.basename(outLocal)}`;
    const dest = path.join(UPLOADS_DIR, filename);
    await fs.promises.copyFile(outLocal, dest);
    await safeUnlink(outLocal);
    return { ok: true, outputPath: dest, publicPath: `/uploads/media/${filename}` };
  } catch (e) {
    await safeUnlink(outLocal);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * @param {string} bin
 * @param {string[]} args
 */
function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg_mux_failed:${code}:${stderr.slice(-400)}`));
    });
  });
}

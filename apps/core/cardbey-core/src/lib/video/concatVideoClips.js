/**
 * Concatenate video clips via ffmpeg concat demuxer.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createTempPath, safeUnlink } from '../tempFiles.js';
import { initializeVideoFfmpeg } from '../videoCompat.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {string[]} clipPaths local file paths
 * @returns {Promise<{ ok: boolean, outputPath?: string, publicPath?: string, error?: string, recoverable?: boolean }>}
 */
export async function concatVideoClips(clipPaths) {
  const clips = (clipPaths ?? []).filter((p) => typeof p === 'string' && p.trim() && fs.existsSync(p.trim()));
  if (!clips.length) {
    return { ok: false, error: 'no_clips', recoverable: true };
  }
  if (clips.length === 1) {
    return { ok: true, outputPath: clips[0], publicPath: null, singleClip: true };
  }

  await initializeVideoFfmpeg();
  const { default: ffmpegStatic } = await import('ffmpeg-static');

  const listFile = createTempPath('cardbey-concat-', '.txt');
  const outLocal = createTempPath('cardbey-concat-out-', '.mp4');

  const listBody = clips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.promises.writeFile(listFile, listBody, 'utf8');

  const args = [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    outLocal,
  ];

  try {
    await runFfmpeg(ffmpegStatic, args);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${Date.now()}-concat-${path.basename(outLocal)}`;
    const dest = path.join(UPLOADS_DIR, filename);
    await fs.promises.copyFile(outLocal, dest);
    await safeUnlink(outLocal);
    await safeUnlink(listFile);
    return { ok: true, outputPath: dest, publicPath: `/uploads/media/${filename}` };
  } catch (e) {
    await safeUnlink(outLocal);
    await safeUnlink(listFile);
    return {
      ok: false,
      error: e?.message ?? String(e),
      recoverable: true,
    };
  }
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(stderr.slice(-500) || `ffmpeg_exit_${code}`));
    });
  });
}

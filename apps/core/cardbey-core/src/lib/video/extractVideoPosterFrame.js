/**
 * Extract a JPEG poster frame from a video via ffmpeg.
 * Seek ~1s to skip black/fade-in frames; use frame 0 when duration < 2s.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createTempPath, safeUnlink } from '../tempFiles.js';
import { initializeVideoFfmpeg, probeVideoFile } from '../videoCompat.js';

/**
 * @param {number | null | undefined} durationSec
 */
export function computePosterSeekSeconds(durationSec) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return 1;
  return d < 2 ? 0 : 1;
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
      else reject(new Error(`ffmpeg_poster_failed:${code}:${stderr.slice(-400)}`));
    });
  });
}

/**
 * @param {string} videoPath
 * @param {string} outputJpegPath
 * @param {{ durationSec?: number | null, seekSec?: number }} [opts]
 */
export async function extractPosterJpegFromFile(videoPath, outputJpegPath, opts = {}) {
  const video = String(videoPath ?? '').trim();
  if (!video || !fs.existsSync(video)) {
    throw new Error('video_file_missing');
  }

  await initializeVideoFfmpeg();
  const { default: ffmpegStatic } = await import('ffmpeg-static');
  if (!ffmpegStatic) throw new Error('ffmpeg_not_available');

  let durationSec = opts.durationSec;
  if (durationSec == null) {
    try {
      const probe = await probeVideoFile(video);
      durationSec = probe?.duration ?? null;
    } catch {
      durationSec = null;
    }
  }

  const seekSec = opts.seekSec ?? computePosterSeekSeconds(durationSec);
  const seek = Math.max(0, Number(seekSec) || 0);

  await runFfmpeg(ffmpegStatic, [
    '-y',
    '-ss',
    String(seek),
    '-i',
    video,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    outputJpegPath,
  ]);

  if (!fs.existsSync(outputJpegPath) || fs.statSync(outputJpegPath).size < 64) {
    throw new Error('poster_output_empty');
  }

  return fs.readFileSync(outputJpegPath);
}

/**
 * @param {Buffer} videoBuffer
 * @param {{ originalName?: string, durationSec?: number | null }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function extractPosterJpegFromBuffer(videoBuffer, opts = {}) {
  if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length < 64) {
    throw new Error('video_buffer_invalid');
  }

  const ext = path.extname(String(opts.originalName ?? '')).toLowerCase() || '.mp4';
  const inputPath = createTempPath('cardbey-poster-in-', ext);
  const outputPath = createTempPath('cardbey-poster-out-', '.jpg');

  try {
    await fs.promises.writeFile(inputPath, videoBuffer);
    return await extractPosterJpegFromFile(inputPath, outputPath, {
      durationSec: opts.durationSec ?? null,
    });
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

/**
 * Optional subtitle burn-in via ffmpeg (does not overwrite source).
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createTempPath, safeUnlink } from '../tempFiles.js';
import { initializeVideoFfmpeg } from '../videoCompat.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/** Top-center captions: clear of center QR and bottom CTA. */
export const QR_CTA_SAFE_CAPTION_STYLE =
  'Alignment=8,MarginV=72,MarginL=48,MarginR=48,Fontsize=16,Outline=2,Shadow=1,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000';

/**
 * @param {{ videoPath: string, srtContent: string, forceStyle?: string }} opts
 * @returns {Promise<{ ok: boolean, outputPath?: string, publicPath?: string, error?: string }>}
 */
export async function burnSubtitlesIntoVideo(opts) {
  const videoPath = String(opts.videoPath ?? '').trim();
  const srtContent = String(opts.srtContent ?? '').trim();
  if (!videoPath || !fs.existsSync(videoPath)) {
    return { ok: false, error: 'missing_video' };
  }
  if (!srtContent) {
    return { ok: false, error: 'missing_srt' };
  }

  await initializeVideoFfmpeg();
  const { default: ffmpegStatic } = await import('ffmpeg-static');

  const srtPath = createTempPath('cardbey-subs-', '.srt');
  const outLocal = createTempPath('cardbey-burn-', '.mp4');

  await fs.promises.writeFile(srtPath, srtContent, 'utf8');

  const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const forceStyle = String(opts.forceStyle ?? QR_CTA_SAFE_CAPTION_STYLE).replace(/'/g, '');
  const vf = `subtitles='${escapedSrt}':force_style='${forceStyle}'`;

  const args = ['-y', '-i', videoPath, '-vf', vf, '-c:a', 'copy', outLocal];

  try {
    await runFfmpeg(ffmpegStatic, args);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filename = `${Date.now()}-burn-${path.basename(outLocal)}`;
    const dest = path.join(UPLOADS_DIR, filename);
    await fs.promises.copyFile(outLocal, dest);
    await safeUnlink(outLocal);
    await safeUnlink(srtPath);
    return { ok: true, outputPath: dest, publicPath: `/uploads/media/${filename}` };
  } catch (e) {
    await safeUnlink(outLocal);
    await safeUnlink(srtPath);
    return { ok: false, error: e?.message ?? String(e) };
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

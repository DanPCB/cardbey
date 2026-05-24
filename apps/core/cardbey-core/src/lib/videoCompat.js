/**
 * Web/Android TV video compatibility: probe, validate, transcode to H.264 + AAC + faststart.
 */

import fs from 'fs';
import path from 'path';
import { createTempPath, safeUnlink } from './tempFiles.js';
import { info, error as logError } from './logger.js';

let ffmpeg = null;
let ffmpegInitialized = false;
let ffmpegInitPromise = null;

export async function initializeVideoFfmpeg() {
  if (ffmpegInitialized) return ffmpeg;
  if (ffmpegInitPromise) return ffmpegInitPromise;

  ffmpegInitPromise = (async () => {
    try {
      const { default: ffmpegModule } = await import('fluent-ffmpeg');
      ffmpeg = ffmpegModule;
      const { default: ffmpegStatic } = await import('ffmpeg-static');
      const { default: ffprobeStatic } = await import('ffprobe-static');
      if (ffmpeg && ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
      if (ffmpeg && ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);
    } catch (err) {
      console.warn('[videoCompat] ffmpeg/ffprobe packages unavailable:', err.message);
      ffmpeg = null;
    }
    ffmpegInitialized = true;
    return ffmpeg;
  })();

  return ffmpegInitPromise;
}

/**
 * @param {string} filePath
 * @returns {Promise<object>}
 */
export function probeVideoFile(filePath) {
  return new Promise(async (resolve, reject) => {
    const ff = await initializeVideoFfmpeg();
    if (!ff?.ffprobe) {
      return reject(new Error('ffprobe not available'));
    }
    const timeout = setTimeout(() => reject(new Error('ffprobe timeout')), 60000);
    ff.ffprobe(filePath, (err, data) => {
      clearTimeout(timeout);
      if (err) return reject(err);
      resolve(parseFfprobeData(data, filePath));
    });
  });
}

/**
 * @param {import('fluent-ffmpeg').FfprobeData} data
 * @param {string} filePath
 */
function parseFfprobeData(data, filePath) {
  const video = data.streams?.find((s) => s.codec_type === 'video') || null;
  const audio = data.streams?.find((s) => s.codec_type === 'audio') || null;
  const format = data.format || {};
  let fastStart = false;
  try {
    const buf = fs.readFileSync(filePath);
    const scan = buf.subarray(0, Math.min(buf.length, 8 * 1024 * 1024));
    const moov = scan.indexOf(Buffer.from('moov'));
    const mdat = scan.indexOf(Buffer.from('mdat'));
    if (moov !== -1 && mdat !== -1) fastStart = moov < mdat;
  } catch {
    fastStart = false;
  }

  return {
    container: format.format_name || path.extname(filePath).replace('.', '') || 'unknown',
    duration: format.duration ? Number(format.duration) : null,
    sizeBytes: format.size ? Number(format.size) : null,
    video: video
      ? {
          codec: video.codec_name,
          profile: video.profile || null,
          pixFmt: video.pix_fmt,
          width: video.width,
          height: video.height,
        }
      : null,
    audio: audio
      ? {
          codec: audio.codec_name,
          profile: audio.profile || null,
          channels: audio.channels,
        }
      : null,
    fastStart,
    raw: data,
  };
}

/**
 * @param {ReturnType<typeof parseFfprobeData>} probe
 */
export function checkVideoCompatibility(probe) {
  const reasons = [];

  if (!probe?.video) {
    reasons.push('no_video_stream');
  } else {
    const codec = String(probe.video.codec || '').toLowerCase();
    if (codec !== 'h264') reasons.push(`video_codec:${probe.video.codec}`);

    const pix = String(probe.video.pixFmt || '').toLowerCase();
    if (pix !== 'yuv420p') reasons.push(`pixel_format:${probe.video.pixFmt}`);

    const profile = String(probe.video.profile || '').toLowerCase();
    if (
      profile &&
      (profile.includes('high 10') ||
        profile.includes('high10') ||
        profile === 'high 4:4:4' ||
        profile.includes('444'))
    ) {
      reasons.push(`profile:${probe.video.profile}`);
    }
  }

  if (probe?.audio) {
    const ac = String(probe.audio.codec || '').toLowerCase();
    if (ac !== 'aac' && ac !== 'mp3') reasons.push(`audio_codec:${probe.audio.codec}`);
  }

  if (probe && probe.fastStart === false) {
    reasons.push('moov_atom_not_at_start');
  }

  return {
    compatible: reasons.length === 0,
    reasons,
  };
}

function logCompatCheck(probe, check, context = {}) {
  console.log('[VIDEO_COMPAT_CHECK]', {
    ...context,
    compatible: check.compatible,
    reasons: check.reasons,
    codec: probe.video?.codec ?? null,
    profile: probe.video?.profile ?? null,
    pixelFormat: probe.video?.pixFmt ?? null,
    container: probe.container,
    audioCodec: probe.audio?.codec ?? 'none',
    moovFastStart: probe.fastStart,
    duration: probe.duration,
  });
}

/**
 * Full transcode for maximum browser/TV compatibility.
 * @param {string} inputPath
 * @param {string} outputPath
 */
export function transcodeToWebCompatible(inputPath, outputPath) {
  return new Promise(async (resolve, reject) => {
    const ff = await initializeVideoFfmpeg();
    if (!ff) return reject(new Error('ffmpeg not available'));

    console.log('[VIDEO_TRANSCODE_START]', { inputPath, outputPath });

    const timeout = setTimeout(() => reject(new Error('transcode timeout')), 20 * 60 * 1000);

    ff(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-profile:v main',
        '-level 4.1',
        '-movflags +faststart',
        '-c:a aac',
        '-b:a 128k',
        '-ac 2',
        '-preset fast',
        '-crf 23',
      ])
      .output(outputPath)
      .on('end', () => {
        clearTimeout(timeout);
        console.log('[VIDEO_TRANSCODE_SUCCESS]', { outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        console.error('[VIDEO_TRANSCODE_FAILED]', { message: err.message, inputPath });
        reject(err);
      })
      .run();
  });
}

/**
 * Remux only (copy streams) with faststart when codecs already OK.
 */
function remuxFaststart(inputPath, outputPath) {
  return new Promise(async (resolve, reject) => {
    const ff = await initializeVideoFfmpeg();
    if (!ff) return reject(new Error('ffmpeg not available'));

    console.log('[VIDEO_TRANSCODE_START]', { mode: 'remux_faststart', inputPath, outputPath });

    const timeout = setTimeout(() => reject(new Error('remux timeout')), 10 * 60 * 1000);

    ff(inputPath)
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => {
        clearTimeout(timeout);
        console.log('[VIDEO_TRANSCODE_SUCCESS]', { mode: 'remux_faststart', outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        console.error('[VIDEO_TRANSCODE_FAILED]', { mode: 'remux_faststart', message: err.message });
        reject(err);
      })
      .run();
  });
}

/**
 * Process upload buffer: probe, transcode if needed, return final buffer + metadata.
 * @param {Buffer} inputBuffer
 * @param {string} originalName
 * @param {{ context?: string }} [opts]
 */
export async function ensureWebCompatibleVideoBuffer(inputBuffer, originalName = 'video.mp4', opts = {}) {
  const ext = path.extname(originalName) || '.mp4';
  const inputPath = createTempPath('cardbey-video-in-', ext);
  const outputPath = createTempPath('cardbey-video-out-', '.mp4');
  const ctx = opts.context || 'upload';

  try {
    await fs.promises.writeFile(inputPath, inputBuffer);

    let probe;
    try {
      probe = await probeVideoFile(inputPath);
    } catch (probeErr) {
      console.warn('[VIDEO_COMPAT_CHECK] ffprobe failed, will attempt transcode', {
        context: ctx,
        message: probeErr.message,
      });
      probe = { video: null, audio: null, fastStart: false, container: 'unknown', duration: null };
    }

    const check = checkVideoCompatibility(probe);
    logCompatCheck(probe, check, { context: ctx, originalName });

    let finalPath = inputPath;
    let transcoded = false;

    if (!check.compatible) {
      const onlyFaststart =
        check.reasons.length === 1 && check.reasons[0] === 'moov_atom_not_at_start';

      try {
        if (onlyFaststart) {
          await remuxFaststart(inputPath, outputPath);
        } else {
          await transcodeToWebCompatible(inputPath, outputPath);
        }
        finalPath = outputPath;
        transcoded = true;
        probe = await probeVideoFile(finalPath);
        const recheck = checkVideoCompatibility(probe);
        logCompatCheck(probe, recheck, { context: ctx, originalName, afterTranscode: true });
        if (!recheck.compatible) {
          info('VIDEO_COMPAT', 'Post-transcode warnings (non-fatal)', {
            reasons: recheck.reasons,
            originalName,
          });
        }
      } catch (transcodeErr) {
        logError('VIDEO_TRANSCODE_FAILED', 'Upload transcode failed; storing original', {
          context: ctx,
          originalName,
          message: transcodeErr.message,
        });
        finalPath = inputPath;
        transcoded = false;
      }
    }

    const outBuffer = await fs.promises.readFile(finalPath);
    return {
      buffer: outBuffer,
      mime: 'video/mp4',
      width: probe.video?.width ?? null,
      height: probe.video?.height ?? null,
      durationS: probe.duration ? Math.round(probe.duration) : null,
      transcoded,
      compatible: check.compatible || transcoded,
      compatReport: { probe, check },
    };
  } finally {
    await safeUnlink(inputPath, 'VIDEO_COMPAT');
    if (outputPath !== inputPath) await safeUnlink(outputPath, 'VIDEO_COMPAT');
  }
}

/**
 * Shared Kling text-to-video generation + local storage.
 */

import { createVideoTask, waitForVideo } from './klingClient.js';

/**
 * @param {{
 *   prompt: string;
 *   duration?: number | string;
 *   aspectRatio?: string;
 *   enableNativeAudio?: boolean;
 *   onPoll?: (info: { taskId: string; status: string }) => void | Promise<void>;
 * }} opts
 */
export async function generateVideoViaKling(opts) {
  const prompt = String(opts.prompt ?? '').trim();
  if (!prompt) {
    throw new Error('Video prompt is required for Kling generation');
  }

  const duration = Number(opts.duration) || Number(process.env.KLING_DEFAULT_DURATION) || 5;
  const aspectRatio =
    typeof opts.aspectRatio === 'string' && opts.aspectRatio.trim()
      ? opts.aspectRatio.trim()
      : process.env.KLING_DEFAULT_ASPECT_RATIO ?? '16:9';

  const enableNativeAudio =
    opts.enableNativeAudio === true ||
    String(process.env.KLING_ENABLE_NATIVE_AUDIO ?? '').trim().toLowerCase() === 'true';

  const { taskId } = await createVideoTask({
    prompt,
    duration,
    aspectRatio,
    enableNativeAudio,
  });

  if (typeof opts.onPoll === 'function') {
    await opts.onPoll({ taskId, status: 'submitted' });
  }

  const result = await waitForVideo(taskId);

  if (!result.completed || !result.videoUrl) {
    throw new Error(result.error ?? 'Kling video generation incomplete');
  }

  let finalVideoUrl = result.videoUrl;
  let stored = null;

  try {
    const { downloadAndStoreVideo } = await import('./downloadVideo.js');
    stored = await downloadAndStoreVideo(result.videoUrl, { prefix: 'kling' });
    finalVideoUrl = stored.publicPath;
  } catch (downloadErr) {
    console.warn('[Kling] download failed, using CDN URL:', downloadErr?.message ?? downloadErr);
  }

  return {
    taskId,
    videoUrl: finalVideoUrl,
    heroVideoUrl: finalVideoUrl,
    heroVideoUrlIosSafe:
      typeof stored?.iosSafePublicPath === 'string' ? stored.iosSafePublicPath : finalVideoUrl,
    cdnUrl: result.videoUrl,
    thumbnailUrl: result.thumbnailUrl ?? null,
    duration: result.duration ?? duration,
    prompt,
  };
}

// DANH: kling-video-wiring
// Side effect: calls Kling API (async task creation)
// Returns taskId immediately; video URL available
// after polling completes (see waitForVideo)

import { createVideoTask, waitForVideo } from '../../video/klingClient.js';

export async function execute(input = {}) {
  const {
    script,
    style = 'professional',
    storeName = '',
    duration = 5,
    aspectRatio = '16:9',
  } = input;

  // Check env config
  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
    return {
      status: 'ok',
      output: {
        queued: false,
        reason: 'Kling API credentials not configured',
        suggestion:
          'Add KLING_ACCESS_KEY and ' + 'KLING_SECRET_KEY to .env',
      },
    };
  }

  // Build video prompt from script
  const prompt = buildVideoPrompt({
    script,
    style,
    storeName,
  });

  try {
    // Submit generation task (returns immediately)
    const { taskId } = await createVideoTask({
      prompt,
      duration,
      aspectRatio,
    });

    // Poll for completion (up to 5 min)
    const result = await waitForVideo(taskId);

    if (result.completed && result.videoUrl) {
      // DANH: kling-video-storage
      let finalVideoUrl = result.videoUrl;

      try {
        const { downloadAndStoreVideo } = await import('../../video/downloadVideo.js');
        const stored = await downloadAndStoreVideo(result.videoUrl, { prefix: 'kling' });
        finalVideoUrl = stored.publicPath;
        console.log('[VideoGen] stored locally:', stored.publicPath);
      } catch (downloadErr) {
        console.warn(
          '[VideoGen] download failed, using CDN URL:',
          downloadErr?.message ?? downloadErr,
        );
      }

      return {
        status: 'ok',
        output: {
          queued: true,
          completed: true,
          taskId,
          videoUrl: finalVideoUrl,
          cdnUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          duration: result.duration,
          prompt,
          storeName,
        },
      };
    }

    return {
      status: 'ok',
      output: {
        queued: true,
        completed: false,
        taskId,
        error: result.error ?? 'Generation incomplete',
        prompt,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: {
        code: 'KLING_API_ERROR',
        message: err.message,
      },
    };
  }
}

/**
 * Build a video prompt optimised for store promos
 */
function buildVideoPrompt({ script, style, storeName }) {
  const styleMap = {
    professional:
      'cinematic, professional lighting, ' +
      'smooth camera movement',
    energetic:
      'dynamic cuts, vibrant colors, ' + 'upbeat energy',
    minimal:
      'clean, minimal, elegant, ' + 'white space, modern',
    warm:
      'warm tones, inviting atmosphere, ' + 'soft lighting',
  };

  const styleDesc = styleMap[style] ?? styleMap.professional;

  const storeContext = storeName ? `for ${storeName}, ` : '';

  // Use first scene or voiceover from script
  const scriptText =
    typeof script === 'object'
      ? (script.voiceover ??
        script.scenes?.[0]?.description ??
        JSON.stringify(script).slice(0, 200))
      : String(script ?? '').slice(0, 400);

  return (
    `${storeContext}${scriptText}. ` +
    `Style: ${styleDesc}. ` +
    `High quality, 4K, professional video.`
  );
}

export default execute;

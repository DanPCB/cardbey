// DANH: kling-video-wiring
// Side effect: calls Kling API (async task creation)
// Returns taskId immediately; video URL available
// after polling completes (see waitForVideo)

import { resolveVideoProvider } from '../../video/videoProvider.js';
import { generateVideoViaKling } from '../../video/generateVideoViaKling.js';
import { buildVideoPromptFromStoreContext } from './analyze_video_brief.js';

export async function execute(input = {}) {
  const {
    script,
    style = 'professional',
    storeName = '',
    storeId = '',
    userMessage = '',
    autoPrompt = '',
    duration = 5,
    aspectRatio = '16:9',
  } = input;

  if (!resolveVideoProvider()) {
    return {
      status: 'ok',
      output: {
        queued: false,
        reason: 'Video provider not configured',
        suggestion:
          'Set VIDEO_GENERATION_PROVIDER=kling or add KLING_ACCESS_KEY and KLING_SECRET_KEY to .env',
      },
    };
  }

  const explicitMessage = String(userMessage ?? autoPrompt ?? '').trim();
  let storePrompt = '';
  const sid = typeof storeId === 'string' ? storeId.trim() : '';
  if (sid) {
    storePrompt = await buildVideoPromptFromStoreContext(sid);
  }

  const prompt = buildVideoPrompt({
    script,
    style,
    storeName,
    userMessage: explicitMessage,
    storePrompt,
  });

  try {
    const result = await generateVideoViaKling({
      prompt,
      duration,
      aspectRatio,
    });

    return {
      status: 'ok',
      output: {
        queued: true,
        completed: true,
        taskId: result.taskId,
        videoUrl: result.videoUrl,
        heroVideoUrl: result.heroVideoUrl,
        heroVideoUrlOriginal: result.videoUrl,
        heroVideoUrlIosSafe: result.heroVideoUrlIosSafe,
        cdnUrl: result.cdnUrl,
        thumbnailUrl: result.thumbnailUrl,
        duration: result.duration,
        prompt,
        storeName,
        sourceType: 'video_generation',
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
function buildVideoPrompt({ script, style, storeName, userMessage, storePrompt }) {
  const styleMap = {
    professional:
      'cinematic, professional lighting, ' +
      'smooth camera movement',
    fashion_runway:
      'high fashion runway, elegant models, ' +
      'dramatic lighting, luxury boutique atmosphere',
    promotional:
      'dynamic promotional energy, vibrant colors, ' +
      'product highlights',
    brand_story:
      'warm brand storytelling, inviting atmosphere, ' +
      'authentic business showcase',
    energetic:
      'dynamic cuts, vibrant colors, ' + 'upbeat energy',
    minimal:
      'clean, minimal, elegant, ' + 'white space, modern',
    warm:
      'warm tones, inviting atmosphere, ' + 'soft lighting',
  };

  const styleDesc = styleMap[style] ?? styleMap.professional;
  const storeContext = storeName ? `for ${storeName}, ` : '';

  const scriptText =
    typeof script === 'object'
      ? (script.voiceover ??
        script.scenes?.[0]?.description ??
        JSON.stringify(script).slice(0, 200))
      : String(script ?? '').slice(0, 400);

  const contextLead = [storePrompt, userMessage].filter(Boolean).join('. ');

  return (
    `${storeContext}${contextLead || scriptText}. ` +
    `Style: ${styleDesc}. ` +
    `High quality, 4K, professional video.`
  ).trim();
}

export default execute;

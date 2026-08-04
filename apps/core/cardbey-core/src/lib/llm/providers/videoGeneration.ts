/**
 * Video generation providers for llmGateway (Phase 3).
 * Thin wrappers over existing OpenAI Videos + Kling clients.
 */

import type { VideoGenerationRequest, VideoGenerationResponse } from '../multimodalTypes.js';

export async function openaiVideoGeneration(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  const { generateOpenAiPromoVideo } = await import('../../video/openaiVideoProvider.js');
  const model =
    request.model?.trim() ||
    process.env.OPENAI_VIDEO_MODEL?.trim() ||
    'sora-2';

  const result = await generateOpenAiPromoVideo({
    prompt: request.prompt,
    ...(request.duration ? { seconds: request.duration } : {}),
    ...(request.resolution ? { size: request.resolution } : {}),
    ...(request.input ?? {}),
  });

  const videoUrl =
    (typeof result?.videoUrl === 'string' && result.videoUrl) ||
    (typeof result?.url === 'string' && result.url) ||
    (typeof result?.localPath === 'string' && result.localPath) ||
    '';

  return {
    videoUrl,
    provider: 'openai',
    model,
    status: videoUrl ? 'completed' : 'failed',
    raw: result,
  };
}

export async function klingVideoGeneration(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  const { generateVideoViaKling } = await import('../../video/generateVideoViaKling.js');
  const model = request.model?.trim() || process.env.KLING_MODEL?.trim() || 'kling-v3';

  const result = await generateVideoViaKling({
    prompt: request.prompt,
    ...(request.duration ? { duration: request.duration } : {}),
    ...(request.input ?? {}),
  });

  const videoUrl =
    (typeof result?.videoUrl === 'string' && result.videoUrl) ||
    (typeof result?.url === 'string' && result.url) ||
    '';

  return {
    videoUrl,
    provider: 'kling',
    model,
    status: videoUrl ? 'completed' : 'failed',
    raw: result,
  };
}

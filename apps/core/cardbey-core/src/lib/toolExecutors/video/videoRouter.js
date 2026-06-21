/**
 * Video Router — unified video generation with provider routing.
 * Routes create_video / generate_video through the standard tool dispatcher.
 */

import { EXECUTION_STATES } from '../../telemetry/executionStates.js';
import {
  generateVideoViaProvider,
  isVideoGenerationProviderAvailable,
  resolveVideoProvider,
} from '../../video/videoArtifactContract.js';
import { videoProviderUnavailableReason } from '../../video/videoProvider.js';

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' ? input.storeId.trim() : '') ||
    (typeof context?.storeId === 'string' ? context.storeId.trim() : '');

  const prompt =
    (typeof input?.prompt === 'string' ? input.prompt.trim() : '') ||
    (typeof input?.userMessage === 'string' ? input.userMessage.trim() : '') ||
    (typeof input?.description === 'string' ? input.description.trim() : '') ||
    (typeof context?.intent === 'string' ? context.intent.trim() : '');

  if (!storeId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'STORE_ID_REQUIRED',
        message: 'Store ID is required for video generation',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  if (!prompt) {
    return {
      status: 'blocked',
      blocker: {
        code: 'PROMPT_REQUIRED',
        message: 'Video prompt is required',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  const provider = resolveVideoProvider();
  if (!provider || !isVideoGenerationProviderAvailable()) {
    const reason = videoProviderUnavailableReason() || 'Video provider not configured';
    return {
      status: 'blocked',
      blocker: {
        code: 'VIDEO_PROVIDER_UNAVAILABLE',
        message: reason,
      },
      output: {
        executionState: EXECUTION_STATES.BLOCKED,
        provider: provider ?? null,
      },
    };
  }

  try {
    const missionId =
      (context?.missionId && String(context.missionId).trim()) ||
      (input?.missionId && String(input.missionId).trim()) ||
      undefined;

    const artifact = await generateVideoViaProvider(
      {
        ...input,
        prompt,
        storeId,
        duration: input?.duration,
        style: input?.style,
      },
      context,
      { missionId },
    );

    const videoUrl = artifact?.url ?? artifact?.previewUrl ?? null;

    return {
      status: 'ok',
      output: {
        executionState: EXECUTION_STATES.EXECUTED,
        videoUrl,
        thumbnail: artifact?.thumbnailUrl ?? null,
        duration: input?.duration ?? artifact?.metadata?.duration ?? null,
        provider: resolveVideoProvider(),
        message: artifact?.message ?? `Video generated successfully using ${resolveVideoProvider()}`,
        artifact,
      },
    };
  } catch (error) {
    console.error('[VideoRouter] Generation failed:', error);
    return {
      status: 'failed',
      error: {
        code: 'GENERATION_FAILED',
        message: `Failed to generate video: ${error?.message ?? String(error)}`,
      },
      output: { executionState: EXECUTION_STATES.FAILED },
    };
  }
}

export default execute;

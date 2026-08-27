/**
 * Video artifact helpers — built on universal artifactContract.
 */

import {
  artifactFailed,
  artifactProcessing,
  artifactReady,
  artifactUnavailable,
  createArtifact,
} from '../artifacts/artifactContract.js';
import { Features } from '../../config/features.js';
import { generateVideo } from '../llm/llmGateway.ts';
import { resolveVideoProvider, isVideoGenerationProviderAvailable, resolveRequestedVideoProvider } from './videoProvider.js';

export { resolveVideoProvider, isVideoGenerationProviderAvailable, resolveRequestedVideoProvider } from './videoProvider.js';

export const VIDEO_ARTIFACT_UNAVAILABLE_MESSAGE =
  'Video generation is not connected yet. We can help with images, copy, and campaigns in the meantime.';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
async function resolveGenerationPrompt(input = {}, context = {}) {
  const explicit =
    (typeof input?.prompt === 'string' && input.prompt.trim()) ||
    (typeof input?.description === 'string' && input.description.trim()) ||
    (typeof input?.userMessage === 'string' && input.userMessage.trim()) ||
    (typeof input?.autoPrompt === 'string' && input.autoPrompt.trim()) ||
    '';

  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    '';

  if (storeId) {
    try {
      const { buildVideoPromptFromStoreContext } = await import(
        '../toolExecutors/video/analyze_video_brief.js'
      );
      const storePrompt = await buildVideoPromptFromStoreContext(storeId);
      if (storePrompt) {
        return explicit ? `${storePrompt}. ${explicit}` : storePrompt;
      }
    } catch {
      /* non-fatal */
    }
  }

  return explicit || 'Promotional video for store';
}

/**
 * @param {Partial<import('../artifacts/artifactContract.js').OperationalArtifact> & { status: import('../artifacts/artifactContract.js').ArtifactStatus }} fields
 */
export function buildVideoArtifact(fields) {
  return createArtifact({
    type: 'video',
    title: fields.title ?? 'Promotional video',
    ...fields,
  });
}

/**
 * @param {object} [input]
 * @param {object} [context]
 * @param {{
 *   artifactId?: string;
 *   missionId?: string;
 *   onProcessingUpdate?: (artifact: import('../artifacts/artifactContract.js').OperationalArtifact) => void | Promise<void>;
 * }} [options]
 */
export async function generateVideoViaProvider(input = {}, context = {}, options = {}) {
  const provider = resolveRequestedVideoProvider(input);
  const missionId =
    options.missionId ||
    (context?.missionId && String(context.missionId).trim()) ||
    (input?.missionId && String(input.missionId).trim()) ||
    undefined;

  if (provider === 'kling') {
    const prompt = await resolveGenerationPrompt(input, context);

    const emitProcessing = async (info) => {
      if (!options.onProcessingUpdate) return;
      await options.onProcessingUpdate(
        artifactProcessing({
          id: options.artifactId,
          type: 'video',
          missionId,
          provider: 'kling',
          message:
            info.status === 'submitted'
              ? 'Video job queued with Kling…'
              : 'Generating your promotional video with Kling…',
          metadata: { taskId: info.taskId, klingStatus: info.status },
        }),
      );
    };

    let result;
    if (Features.video.useGateway) {
      const gatewayResult = await generateVideo({
        prompt,
        provider: 'kling',
        duration: input?.lengthSeconds ?? input?.duration,
        purpose: 'video_artifact',
        input: {
          aspectRatio: input?.aspectRatio,
          onPoll: emitProcessing,
        },
      });
      result = {
        videoUrl: gatewayResult.videoUrl,
        thumbnailUrl: gatewayResult.raw?.thumbnailUrl ?? null,
        taskId: gatewayResult.raw?.taskId,
        cdnUrl: gatewayResult.raw?.cdnUrl,
        heroVideoUrlIosSafe: gatewayResult.raw?.heroVideoUrlIosSafe,
      };
    } else {
      const { generateVideoViaKling } = await import('./generateVideoViaKling.js');
      result = await generateVideoViaKling({
        prompt,
        duration: input?.lengthSeconds ?? input?.duration,
        aspectRatio: input?.aspectRatio,
        onPoll: emitProcessing,
      });
    }

    return artifactReady({
      id: options.artifactId,
      type: 'video',
      missionId,
      url: result.videoUrl,
      previewUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl ?? null,
      provider: 'kling',
      message: 'Your promotional video is ready.',
      metadata: {
        taskId: result.taskId,
        cdnUrl: result.cdnUrl,
        heroVideoUrlIosSafe: result.heroVideoUrlIosSafe,
        sourceType: 'video_generation',
      },
    });
  }

  if (provider === 'minimax') {
    const prompt = await resolveGenerationPrompt(input, context);
    const emitProcessing = async (info) => {
      if (!options.onProcessingUpdate) return;
      await options.onProcessingUpdate(
        artifactProcessing({
          id: options.artifactId,
          type: 'video',
          missionId,
          provider: 'minimax',
          message: info.message || 'Generating your promotional video with MiniMax H3…',
          metadata: {
            provider: 'minimax',
            providerModel: 'MiniMax-H3',
            providerTaskId: info.taskId || null,
            minimaxStatus: info.status,
            stage: info.stage || null,
            estimatedCostUsd: info.costEstimate?.amountUsd ?? null,
            estimatedCostLabel: info.costEstimate?.label ?? null,
            costIsEstimate: true,
            resolution: info.settings?.resolution ?? null,
            durationSeconds: info.settings?.durationSeconds ?? null,
            aspectRatio: info.settings?.aspectRatio ?? null,
            generationStarted: Boolean(info.taskId),
            selectionReason: info.settings?.selectionReason || 'explicit_minimax_request',
            audioIncluded: false,
          },
        }),
      );
    };

    const { generateVideoViaMiniMax } = await import('./generateVideoViaMiniMax.js');
    const { MiniMaxProviderError } = await import('./minimax/minimaxErrors.js');
    try {
      const result = await generateVideoViaMiniMax({
        prompt,
        duration: input?.lengthSeconds ?? input?.duration,
        lengthSeconds: input?.lengthSeconds,
        aspectRatio: input?.aspectRatio,
        resolution: input?.resolution,
        imageUrl: input?.imageUrl,
        firstFrameUrl: input?.firstFrameUrl,
        lastFrameUrl: input?.lastFrameUrl,
        referenceImageUrl: input?.referenceImageUrl,
        providerTaskId: input?.providerTaskId || input?.minimaxTaskId,
        selectionReason:
          input?.provider === 'minimax' || input?.approvedPlan?.provider === 'minimax'
            ? 'explicit_request_provider'
            : 'explicit_env_VIDEO_GENERATION_PROVIDER',
        onPoll: emitProcessing,
      });

      return artifactReady({
        id: options.artifactId,
        type: 'video',
        missionId,
        url: result.videoUrl,
        previewUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl ?? null,
        provider: 'minimax',
        message: 'Your promotional video is ready.',
        metadata: {
          provider: 'minimax',
          providerModel: result.providerModel,
          providerTaskId: result.providerTaskId,
          taskId: result.providerTaskId,
          cdnUrl: result.cdnUrl,
          heroVideoUrlIosSafe: result.heroVideoUrlIosSafe,
          sourceType: 'video_generation',
          estimatedCostUsd: result.costEstimateUsd,
          estimatedCostLabel: result.costEstimateLabel,
          costIsEstimate: true,
          resolution: result.resolution,
          durationSeconds: result.durationSeconds,
          aspectRatio: result.aspectRatio,
          generationStarted: true,
          audioIncluded: false,
          nativeProviderAudioNotAuthoritative: true,
          selectionReason: result.selectionReason,
          usage: result.usage,
        },
      });
    } catch (err) {
      if (err instanceof MiniMaxProviderError) throw err;
      throw err;
    }
  }

  if (provider === 'mock') {
    const url = String(process.env.VIDEO_ARTIFACT_MOCK_URL ?? '').trim();
    if (!url) throw new Error('VIDEO_ARTIFACT_MOCK_URL is not set');
    return artifactReady({
      type: 'video',
      missionId,
      url,
      previewUrl: url,
      provider: 'mock',
      message: 'Video is ready to preview.',
    });
  }

  if (provider === 'openai') {
    const { openaiVideoEngine } = await import('../../ai/engines/openaiVideoEngine.js');
    const { OpenAiVideoUnavailableError } = await import('./openaiVideoErrors.js');

    const emitProcessing = async (info) => {
      if (!options.onProcessingUpdate) return;
      const progress =
        typeof info.progress === 'number' && Number.isFinite(info.progress)
          ? Math.round(info.progress)
          : null;
      const msg =
        info.status === 'queued'
          ? 'Video job queued with OpenAI…'
          : progress != null
            ? `Generating your promotional video… ${progress}%`
            : 'Generating your promotional video…';
      await options.onProcessingUpdate(
        artifactProcessing({
          id: options.artifactId,
          type: 'video',
          missionId,
          provider: 'openai',
          message: msg,
          metadata: {
            providerJobId: info.providerJobId,
            openaiStatus: info.status,
            progress: info.progress,
          },
        }),
      );
    };

    try {
      const result = await openaiVideoEngine.generateVideo(
        {
          prompt:
            (typeof input?.prompt === 'string' && input.prompt.trim()) ||
            (typeof input?.description === 'string' && input.description.trim()) ||
            'Promotional video for store',
          lengthSeconds:
            typeof input?.lengthSeconds === 'number'
              ? input.lengthSeconds
              : Number(process.env.OPENAI_VIDEO_SECONDS) || 8,
          style: typeof input?.style === 'string' ? input.style : undefined,
          storeId:
            (typeof input?.storeId === 'string' && input.storeId.trim()) ||
            (typeof context?.storeId === 'string' && context.storeId.trim()) ||
            undefined,
          aspectRatio: typeof input?.aspectRatio === 'string' ? input.aspectRatio : undefined,
        },
        {
          onJobCreated: emitProcessing,
          onPoll: emitProcessing,
        },
      );

      const videoUrl = typeof result?.videoUrl === 'string' ? result.videoUrl.trim() : '';
      if (!videoUrl) throw new Error('Video provider returned no URL');

      return artifactReady({
        id: options.artifactId,
        type: 'video',
        missionId,
        url: videoUrl,
        previewUrl: videoUrl,
        thumbnailUrl: result?.thumbnailUrl ?? null,
        provider: 'openai',
        message: 'Your promotional video is ready.',
        metadata: {
          providerJobId: result?.providerJobId,
          ...(result?.raw && typeof result.raw === 'object' ? result.raw : {}),
        },
      });
    } catch (err) {
      if (err instanceof OpenAiVideoUnavailableError) throw err;
      throw err;
    }
  }

  throw new Error(
    `Unknown or unconfigured video provider: ${provider || '(unset) — set VIDEO_GENERATION_PROVIDER or KLING keys'}`,
  );
}

export { artifactProcessing, artifactFailed, artifactUnavailable, artifactReady };

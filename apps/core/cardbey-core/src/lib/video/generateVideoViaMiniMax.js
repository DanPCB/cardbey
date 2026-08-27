/**
 * MiniMax H3 generation + Cardbey media custody.
 * Reuses downloadAndStoreVideo. Does not treat the provider CDN URL as the permanent asset.
 * Does not mux narration — Factory post-production remains canonical.
 */

import {
  estimateMinimaxCostUsd,
  MINIMAX_PROVIDER,
  redactMinimaxSecrets,
  resolveMinimaxGenerationSettings,
} from './minimax/minimaxConfig.js';
import {
  buildMinimaxCreateBody,
  createMinimaxVideoTask,
  waitForMinimaxVideo,
} from './minimax/minimaxClient.js';
import { MiniMaxProviderError } from './minimax/minimaxErrors.js';

function logSafe(event, payload) {
  console.info(`[MiniMax] ${event}`, redactMinimaxSecrets(payload));
}

/**
 * @param {{
 *   prompt: string;
 *   duration?: number | string;
 *   lengthSeconds?: number;
 *   aspectRatio?: string;
 *   resolution?: string;
 *   imageUrl?: string;
 *   firstFrameUrl?: string;
 *   lastFrameUrl?: string;
 *   referenceImageUrl?: string;
 *   providerTaskId?: string;
 *   selectionReason?: string;
 *   onPoll?: (info: object) => void | Promise<void>;
 *   env?: NodeJS.ProcessEnv;
 *   fetchImpl?: typeof fetch;
 * }} opts
 */
export async function generateVideoViaMiniMax(opts = {}) {
  const env = opts.env || process.env;
  const prompt = String(opts.prompt ?? '').trim();
  if (!prompt) {
    throw new MiniMaxProviderError({
      code: 'MINIMAX_INVALID_PARAMS',
      message: 'Video prompt is required for MiniMax generation',
      userMessage: 'A video description is required.',
    });
  }

  const settings = resolveMinimaxGenerationSettings(
    {
      duration: opts.duration ?? opts.lengthSeconds,
      lengthSeconds: opts.lengthSeconds,
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      imageUrl: opts.imageUrl,
      firstFrameUrl: opts.firstFrameUrl,
      lastFrameUrl: opts.lastFrameUrl,
      image_url: opts.image_url,
      referenceImageUrl: opts.referenceImageUrl,
      referenceVideoUrl: opts.referenceVideoUrl,
      referenceAudioUrl: opts.referenceAudioUrl,
      selectionReason: opts.selectionReason,
    },
    env,
  );

  const costEstimate = settings.costEstimate || estimateMinimaxCostUsd(settings, env);

  if (typeof opts.onPoll === 'function') {
    await opts.onPoll({
      taskId: opts.providerTaskId || null,
      status: 'SUBMITTING',
      stage: 'estimating_cost',
      message: 'Estimating generation cost',
      costEstimate,
      settings,
    });
  }

  let taskId = String(opts.providerTaskId || '').trim();
  let providerRequestId = null;

  if (!taskId) {
    const body = buildMinimaxCreateBody(settings, prompt, opts);
    if (typeof opts.onPoll === 'function') {
      await opts.onPoll({
        taskId: null,
        status: 'SUBMITTING',
        stage: 'submitting',
        message: 'Submitting to MiniMax H3',
        costEstimate,
        settings,
      });
    }
    const created = await createMinimaxVideoTask({
      body,
      env,
      fetchImpl: opts.fetchImpl,
    });
    taskId = created.taskId;
    providerRequestId = created.providerRequestId;
    logSafe('task_created', {
      taskId,
      model: settings.model,
      resolution: settings.resolution,
      durationSeconds: settings.durationSeconds,
      aspectRatio: settings.aspectRatio,
      estimatedCostUsd: costEstimate.amountUsd,
      selectionReason: settings.selectionReason,
    });
  } else {
    logSafe('task_resume', { taskId, selectionReason: 'resume_existing_task' });
  }

  if (typeof opts.onPoll === 'function') {
    await opts.onPoll({
      taskId,
      status: 'QUEUED',
      stage: 'waiting',
      message: 'Waiting for video generation',
      costEstimate,
      settings,
      providerRequestId,
    });
  }

  const result = await waitForMinimaxVideo(taskId, {
    env,
    fetchImpl: opts.fetchImpl,
    onPoll: async (info) => {
      if (typeof opts.onPoll === 'function') {
        await opts.onPoll({
          ...info,
          stage: info.status === 'PROCESSING' || info.providerStatus === 'running' ? 'generating' : 'waiting',
          message:
            info.status === 'PROCESSING' || info.providerStatus === 'running'
              ? 'Waiting for video generation'
              : 'Waiting for video generation',
          costEstimate,
          settings,
        });
      }
    },
  });

  if (typeof opts.onPoll === 'function') {
    await opts.onPoll({
      taskId,
      status: 'DOWNLOADING',
      stage: 'downloading',
      message: 'Retrieving generated video',
      costEstimate,
      settings,
    });
  }

  let stored = null;
  try {
    const { downloadAndStoreVideo } = await import('./downloadVideo.js');
    stored = await downloadAndStoreVideo(result.outputUrl, {
      prefix: 'minimax',
      timeoutMs: Number(env.MINIMAX_DOWNLOAD_TIMEOUT_MS) || 120_000,
      requireVideo: true,
      maxBytes: Number(env.MINIMAX_DOWNLOAD_MAX_BYTES) || 250 * 1024 * 1024,
    });
  } catch (downloadErr) {
    const msg = String(downloadErr?.message || downloadErr);
    const expired = /403|404|expired|410/i.test(msg);
    throw new MiniMaxProviderError({
      code: expired ? 'MINIMAX_OUTPUT_EXPIRED' : /html|invalid media|content-type/i.test(msg)
        ? 'MINIMAX_INVALID_MEDIA'
        : 'MINIMAX_DOWNLOAD_FAILED',
      message: msg,
      providerRequestId: result.providerRequestId || providerRequestId,
    });
  }

  const videoUrl = stored?.publicPath;
  if (!videoUrl) {
    throw new MiniMaxProviderError({
      code: 'MINIMAX_DOWNLOAD_FAILED',
      message: 'MiniMax download produced no Cardbey media path.',
    });
  }

  return {
    provider: MINIMAX_PROVIDER,
    providerModel: settings.model,
    providerTaskId: taskId,
    status: 'SUCCEEDED',
    outputUrl: videoUrl,
    durationSeconds: result.durationSeconds ?? settings.durationSeconds,
    resolution: result.resolution || settings.resolution,
    aspectRatio: result.aspectRatio || settings.aspectRatio,
    providerRequestId: result.providerRequestId || providerRequestId,
    costEstimateUsd: costEstimate.amountUsd,
    costEstimateLabel: costEstimate.label,
    costIsEstimate: true,
    videoUrl,
    heroVideoUrl: videoUrl,
    heroVideoUrlIosSafe:
      typeof stored?.iosSafePublicPath === 'string' ? stored.iosSafePublicPath : videoUrl,
    cdnUrl: result.outputUrl,
    thumbnailUrl: null,
    prompt,
    usage: result.usage,
    selectionReason: settings.selectionReason,
    audioIncluded: false,
    nativeProviderAudioNotAuthoritative: true,
  };
}

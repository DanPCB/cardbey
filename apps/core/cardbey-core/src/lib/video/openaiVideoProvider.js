/**
 * OpenAI Sora video generation — create job, poll, download, return artifact fields.
 */

import { getStoreContext } from '../../services/storeContext.js';
import { buildPromoVideoPrompt } from './buildPromoVideoPrompt.js';
import {
  createOpenAiVideoJob,
  downloadOpenAiVideoContent,
  mapOpenAiJobStatus,
  normalizeOpenAiVideoSeconds,
  normalizeOpenAiVideoSize,
  retrieveOpenAiVideoJob,
} from './openaiVideoClient.js';
import { OpenAiVideoFailedError } from './openaiVideoErrors.js';
import { saveGeneratedVideoToUploads } from './saveGeneratedVideo.js';

const DEFAULT_POLL_MS = 12_000;
const DEFAULT_TIMEOUT_MS = 600_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollIntervalMs() {
  const n = Number(process.env.OPENAI_VIDEO_POLL_INTERVAL_MS);
  if (Number.isFinite(n) && n >= 3_000) return n;
  if (process.env.NODE_ENV === 'test' && Number.isFinite(n) && n >= 10) return n;
  return DEFAULT_POLL_MS;
}

function pollTimeoutMs() {
  const n = Number(process.env.OPENAI_VIDEO_POLL_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5_000) return n;
  if (process.env.NODE_ENV === 'test' && Number.isFinite(n) && n >= 50) return n;
  return DEFAULT_TIMEOUT_MS;
}

/**
 * @param {object} input
 * @param {object} context
 * @param {{
 *   onJobCreated?: (info: { providerJobId: string; status: string; progress?: number }) => void | Promise<void>;
 *   onPoll?: (info: { providerJobId: string; status: string; progress?: number }) => void | Promise<void>;
 * }} [hooks]
 */
export async function generateOpenAiPromoVideo(input = {}, context = {}, hooks = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  const store = storeId ? await getStoreContext(storeId) : null;
  const userPrompt =
    (typeof input?.prompt === 'string' && input.prompt.trim()) ||
    (typeof input?.description === 'string' && input.description.trim()) ||
    '';

  const prompt = buildPromoVideoPrompt({
    userPrompt,
    store,
    heroHeadline: input?.heroHeadline ?? input?.headline ?? context?.heroHeadline,
    tagline: input?.tagline ?? context?.tagline,
  });

  const seconds = normalizeOpenAiVideoSeconds(input?.lengthSeconds ?? input?.seconds);
  const size = normalizeOpenAiVideoSize(input?.aspectRatio ?? input?.size);

  const job = await createOpenAiVideoJob({ prompt, seconds, size });
  const providerJobId = String(job?.id ?? '').trim();
  if (!providerJobId) {
    throw new OpenAiVideoFailedError('OpenAI did not return a video job id.', { retryable: false });
  }

  const initialStatus = mapOpenAiJobStatus(job);
  await hooks.onJobCreated?.({
    providerJobId,
    status: initialStatus,
    progress: typeof job?.progress === 'number' ? job.progress : undefined,
  });

  const deadline = Date.now() + pollTimeoutMs();
  let lastJob = job;

  while (Date.now() < deadline) {
    const status = mapOpenAiJobStatus(lastJob);

    if (status === 'completed') {
      const videoBuffer = await downloadOpenAiVideoContent(providerJobId, 'video');
      if (!videoBuffer?.length) {
        throw new OpenAiVideoFailedError('OpenAI returned empty video content.', {
          retryable: true,
          providerJobId,
        });
      }

      const saved = await saveGeneratedVideoToUploads(videoBuffer, { prefix: `sora-${providerJobId.slice(0, 12)}` });

      let thumbnailUrl = null;
      try {
        const thumbBuffer = await downloadOpenAiVideoContent(providerJobId, 'thumbnail');
        if (thumbBuffer?.length) {
          const thumbSaved = await saveGeneratedVideoToUploads(thumbBuffer, {
            prefix: `sora-thumb-${providerJobId.slice(0, 12)}`,
            extension: 'webp',
          });
          thumbnailUrl = thumbSaved.publicUrl;
        }
      } catch {
        // Thumbnail optional
      }

      return {
        url: saved.publicUrl,
        previewUrl: saved.publicUrl,
        thumbnailUrl,
        provider: 'openai',
        providerJobId,
        message: 'Your promotional video is ready.',
        metadata: {
          openaiJob: {
            id: providerJobId,
            model: lastJob?.model,
            seconds: lastJob?.seconds,
            size: lastJob?.size,
          },
          relativeUrl: saved.relativeUrl,
          sizeBytes: saved.sizeBytes,
        },
      };
    }

    if (status === 'failed') {
      const errMsg =
        (lastJob?.error?.message && String(lastJob.error.message)) ||
        'OpenAI video generation failed.';
      throw new OpenAiVideoFailedError(errMsg, { retryable: true, providerJobId });
    }

    await sleep(pollIntervalMs());
    lastJob = await retrieveOpenAiVideoJob(providerJobId);
    await hooks.onPoll?.({
      providerJobId,
      status: mapOpenAiJobStatus(lastJob),
      progress: typeof lastJob?.progress === 'number' ? lastJob.progress : undefined,
    });
  }

  throw new OpenAiVideoFailedError('Video generation timed out while waiting for OpenAI.', {
    retryable: true,
    providerJobId,
  });
}

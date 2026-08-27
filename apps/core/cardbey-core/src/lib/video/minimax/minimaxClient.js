/**
 * MiniMax H3 Video Generation V2 client.
 * Official API: POST /v2/video_generation, GET /v2/query/video_generation/{task_id},
 * DELETE /v2/video_generation/{task_id} (cancel queued / delete finished).
 *
 * Never logs Authorization or MINIMAX_API_KEY.
 */

import {
  MINIMAX_API_BASE_URL,
  MINIMAX_MODEL_H3,
  readMinimaxApiKey,
  redactMinimaxSecrets,
} from './minimaxConfig.js';
import { mapMinimaxHttpError, mapMinimaxTaskError, MiniMaxProviderError } from './minimaxErrors.js';

const STATUS_MAP = {
  queued: 'QUEUED',
  running: 'PROCESSING',
  succeeded: 'SUCCEEDED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

function authHeaders(env = process.env) {
  const key = readMinimaxApiKey(env);
  if (!key) {
    throw new MiniMaxProviderError({
      code: 'MINIMAX_API_KEY_MISSING',
      message: 'MINIMAX_API_KEY is not configured.',
      userMessage: 'MiniMax video is not connected yet.',
    });
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function apiBase(env = process.env) {
  return String(env.MINIMAX_API_BASE_URL || MINIMAX_API_BASE_URL).replace(/\/+$/, '');
}

async function readJsonSafe(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 400) };
  }
}

function requestIdFrom(res, body) {
  return (
    res.headers?.get?.('x-request-id') ||
    res.headers?.get?.('request-id') ||
    body?.request_id ||
    null
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollDelayMs(attempt, baseMs) {
  const exp = Math.min(baseMs * 1.15 ** attempt, 20_000);
  const jitter = exp * 0.2 * Math.random();
  return Math.round(exp + jitter);
}

function retryAfterMs(res, fallbackMs) {
  const raw = res.headers?.get?.('retry-after');
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  return fallbackMs;
}

/**
 * @param {object} settings from resolveMinimaxGenerationSettings
 * @param {string} prompt
 * @param {object} [input]
 */
export function buildMinimaxCreateBody(settings, prompt, input = {}) {
  const text = String(prompt || '').trim().slice(0, 7000);
  const content = [{ type: 'text', text }];

  const first = input.imageUrl || input.firstFrameUrl || input.image_url;
  const last = input.lastFrameUrl;
  const refImage = input.referenceImageUrl;
  const refVideo = input.referenceVideoUrl;
  const refAudio = input.referenceAudioUrl;

  const usesFrame = Boolean(first || last);
  const usesReference = Boolean(refImage || refVideo || refAudio);
  if (usesFrame && usesReference) {
    throw new MiniMaxProviderError({
      code: 'MINIMAX_INVALID_PARAMS',
      message: 'MiniMax H3 cannot mix first/last frame with reference assets.',
      userMessage: 'Use either a start image or reference assets, not both.',
    });
  }

  if (first) {
    content.push({
      type: 'image_url',
      image_url: { url: String(first) },
      role: 'first_frame',
    });
  }
  if (last) {
    content.push({
      type: 'image_url',
      image_url: { url: String(last) },
      role: 'last_frame',
    });
  }
  if (refImage) {
    content.push({
      type: 'image_url',
      image_url: { url: String(refImage) },
      role: 'reference_image',
    });
  }
  if (refVideo) {
    content.push({
      type: 'video_url',
      video_url: { url: String(refVideo) },
      role: 'reference_video',
    });
  }
  if (refAudio) {
    content.push({
      type: 'audio_url',
      audio_url: { url: String(refAudio) },
      role: 'reference_audio',
    });
  }

  return {
    model: settings.model || MINIMAX_MODEL_H3,
    content,
    resolution: settings.resolution,
    duration: settings.durationSeconds,
    ratio: settings.aspectRatio,
  };
}

/**
 * POST /v2/video_generation — paid submission. Caller must not retry after task_id is returned.
 */
export async function createMinimaxVideoTask({ body, env = process.env, fetchImpl = fetch } = {}) {
  const url = `${apiBase(env)}/v2/video_generation`;
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: authHeaders(env),
      body: JSON.stringify(body),
    });
    const json = await readJsonSafe(res);
    const providerRequestId = requestIdFrom(res, json);

    if (res.ok) {
      const taskId = String(json.task_id || json.task?.id || '').trim();
      if (!taskId) {
        throw new MiniMaxProviderError({
          code: 'MINIMAX_PROVIDER_ERROR',
          message: 'MiniMax create response missing task_id.',
          providerRequestId,
        });
      }
      return { taskId, providerRequestId, raw: redactMinimaxSecrets(json, env) };
    }

    const mapped = mapMinimaxHttpError({ status: res.status, body: json, providerRequestId });
    if (mapped.code === 'MINIMAX_RATE_LIMIT' && attempt < 2) {
      lastError = mapped;
      await sleep(retryAfterMs(res, 1500 * (attempt + 1)));
      continue;
    }
    throw mapped;
  }

  throw lastError;
}

export async function getMinimaxVideoTask(taskId, { env = process.env, fetchImpl = fetch } = {}) {
  const id = encodeURIComponent(String(taskId || '').trim());
  const url = `${apiBase(env)}/v2/query/video_generation/${id}`;
  const res = await fetchImpl(url, { method: 'GET', headers: authHeaders(env) });
  const json = await readJsonSafe(res);
  const providerRequestId = requestIdFrom(res, json);

  if (res.status === 429) {
    throw mapMinimaxHttpError({ status: 429, body: json, providerRequestId });
  }
  if (!res.ok) {
    throw mapMinimaxHttpError({ status: res.status, body: json, providerRequestId });
  }

  const task = json.task && typeof json.task === 'object' ? json.task : json;
  const providerStatus = String(task.status || '').toLowerCase();
  const mappedStatus = STATUS_MAP[providerStatus] || 'PROCESSING';
  const outputUrl = typeof task.content?.url === 'string' ? task.content.url : null;

  return {
    taskId: String(task.id || taskId),
    providerStatus,
    status: mappedStatus,
    outputUrl,
    durationSeconds: Number.isFinite(Number(task.duration)) ? Number(task.duration) : null,
    resolution: task.resolution || null,
    aspectRatio: task.ratio || null,
    model: task.model || MINIMAX_MODEL_H3,
    usage: task.usage && typeof task.usage === 'object' ? task.usage : null,
    error: task.error || null,
    providerRequestId,
    raw: redactMinimaxSecrets({ ...task, content: task.content ? { url: outputUrl } : null }, env),
  };
}

/**
 * Poll until terminal. Never creates a new paid task.
 */
export async function waitForMinimaxVideo(
  taskId,
  {
    env = process.env,
    fetchImpl = fetch,
    maxWaitMs = Number(env.MINIMAX_VIDEO_POLL_TIMEOUT_MS) || 240_000,
    intervalMs = Number(env.MINIMAX_VIDEO_POLL_INTERVAL_MS) || 10_000,
    onPoll,
  } = {},
) {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    let result;
    try {
      result = await getMinimaxVideoTask(taskId, { env, fetchImpl });
    } catch (err) {
      if (err instanceof MiniMaxProviderError && err.code === 'MINIMAX_RATE_LIMIT') {
        if (typeof onPoll === 'function') {
          await onPoll({ taskId, status: 'QUEUED', providerStatus: 'rate_limited' });
        }
        await sleep(Math.min(intervalMs * 2, 20_000));
        attempt += 1;
        continue;
      }
      throw err;
    }

    if (typeof onPoll === 'function') {
      await onPoll({
        taskId: result.taskId,
        status: result.status,
        providerStatus: result.providerStatus,
      });
    }

    if (result.status === 'SUCCEEDED') {
      if (!result.outputUrl) {
        throw new MiniMaxProviderError({
          code: 'MINIMAX_MISSING_OUTPUT_URL',
          message: 'MiniMax succeeded without content.url.',
          providerRequestId: result.providerRequestId,
        });
      }
      return { ...result, completed: true };
    }

    if (result.status === 'FAILED' || result.status === 'CANCELLED') {
      throw mapMinimaxTaskError(result.error || {}, result.providerStatus);
    }

    await sleep(pollDelayMs(attempt, intervalMs));
    attempt += 1;
  }

  throw new MiniMaxProviderError({
    code: 'MINIMAX_TIMEOUT',
    message: `MiniMax task ${taskId} timed out after ${maxWaitMs}ms without a second paid submit.`,
    status: 'TIMED_OUT',
  });
}

/**
 * Cancel queued MiniMax task (running tasks cannot be cancelled per docs).
 */
export async function cancelMinimaxVideoTask(taskId, { env = process.env, fetchImpl = fetch } = {}) {
  const id = encodeURIComponent(String(taskId || '').trim());
  const url = `${apiBase(env)}/v2/video_generation/${id}`;
  const res = await fetchImpl(url, { method: 'DELETE', headers: authHeaders(env) });
  const json = await readJsonSafe(res);
  if (!res.ok) {
    throw mapMinimaxHttpError({
      status: res.status,
      body: json,
      providerRequestId: requestIdFrom(res, json),
    });
  }
  return {
    taskId: String(json.task_id || taskId),
    action: json.action || null,
    status: String(json.status || 'cancelled').toUpperCase(),
  };
}

export { STATUS_MAP as MINIMAX_STATUS_MAP };

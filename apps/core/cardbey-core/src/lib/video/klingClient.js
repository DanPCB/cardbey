// DANH: kling-video-wiring

import { getKlingHeaders } from './klingAuth.js';

const BASE_URL =
  process.env.KLING_API_BASE_URL ?? 'https://api.klingai.com';

const MODEL = process.env.KLING_MODEL ?? 'kling-v3';

const DEFAULT_DURATION =
  process.env.KLING_DEFAULT_DURATION ?? '5';

const DEFAULT_ASPECT =
  process.env.KLING_DEFAULT_ASPECT_RATIO ?? '16:9';

/**
 * Submit a text-to-video generation task.
 * Returns { taskId, status }
 */
export async function createVideoTask({
  prompt,
  duration = DEFAULT_DURATION,
  aspectRatio = DEFAULT_ASPECT,
  model = MODEL,
  negativePrompt = '',
  enableNativeAudio = false,
}) {
  const validDuration = Number(duration) >= 10 ? '10' : '5';

  const body = {
    model_name: model,
    prompt,
    negative_prompt: negativePrompt,
    duration: validDuration,
    aspect_ratio: aspectRatio,
    // V3 Omni: cfg_scale and mode not supported
  };

  // Opt-in native audio / SFX when Kling API supports it (verify with ffprobe after download).
  if (enableNativeAudio) {
    body.sound = 'on';
    body.enable_audio = true;
  }

  const res = await fetch(`${BASE_URL}/v1/videos/text2video`, {
    method: 'POST',
    headers: getKlingHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kling API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Kling returns: { code, message, data: { task_id, task_status } }
  if (data.code !== 0) {
    throw new Error(`Kling error: ${data.message}`);
  }

  return {
    taskId: data.data.task_id,
    status: data.data.task_status,
  };
}

/**
 * Poll task status.
 * Returns {
 *   taskId, status,
 *   videoUrl: string | null,
 *   thumbnailUrl: string | null,
 *   duration: number | null
 * }
 */
export async function getVideoTask(taskId) {
  const res = await fetch(`${BASE_URL}/v1/videos/text2video/${taskId}`, {
    headers: getKlingHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Kling poll error ${res.status}`);
  }

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`Kling error: ${data.message}`);
  }

  const task = data.data;
  const works = task.task_result?.videos ?? [];
  const video = works[0] ?? null;

  return {
    taskId: task.task_id,
    status: task.task_status,
    videoUrl: video?.url ?? null,
    thumbnailUrl: video?.cover_image_url ?? null,
    duration: video?.duration ?? null,
    failReason: task.task_status_msg ?? null,
  };
}

/**
 * Poll until completed or failed.
 * maxWaitMs default 5 minutes.
 * intervalMs default 5 seconds.
 */
export async function waitForVideo(
  taskId,
  { maxWaitMs = 300_000, intervalMs = 5_000 } = {},
) {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const result = await getVideoTask(taskId);

    if (result.status === 'succeed') {
      return { ...result, completed: true };
    }

    if (result.status === 'failed') {
      return {
        ...result,
        completed: false,
        error: result.failReason ?? 'Generation failed',
      };
    }

    // status: 'processing' or 'submitted' → keep polling
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return {
    taskId,
    completed: false,
    status: 'timeout',
    error: 'Video generation timed out after 5 minutes',
    videoUrl: null,
  };
}

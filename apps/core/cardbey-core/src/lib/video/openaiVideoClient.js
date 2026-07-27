/**
 * OpenAI Videos API client (fetch-based; works without SDK videos resource).
 * @see https://developers.openai.com/api/docs/guides/video-generation
 */

import { classifyOpenAiHttpError } from './openaiVideoErrors.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * @returns {string}
 */
function getApiKey() {
  const key = String(process.env.OPENAI_API_KEY ?? '').trim();
  if (!key) throw classifyOpenAiHttpError(new Error('OPENAI_API_KEY is not set'), 401);
  return key;
}

/**
 * @param {Response} res
 */
async function parseJsonResponse(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      (body?.error?.message && String(body.error.message)) ||
      (body?.message && String(body.message)) ||
      `OpenAI API error ${res.status}`;
    throw classifyOpenAiHttpError(new Error(msg), res.status);
  }
  return body;
}

/**
 * @param {number | string | undefined} lengthSeconds
 * @returns {'4' | '8' | '12'}
 */
export function normalizeOpenAiVideoSeconds(lengthSeconds) {
  const allowed = [4, 8, 12];
  const n = Number(lengthSeconds);
  if (allowed.includes(n)) return String(n);
  const env = Number(process.env.OPENAI_VIDEO_SECONDS);
  if (allowed.includes(env)) return String(env);
  if (n <= 6) return '4';
  if (n <= 10) return '8';
  return '12';
}

/**
 * @param {string | undefined} aspectHint
 * @returns {'1280x720' | '720x1280'}
 */
export function normalizeOpenAiVideoSize(aspectHint) {
  const env = String(process.env.OPENAI_VIDEO_SIZE ?? '').trim();
  if (env === '1280x720' || env === '720x1280') return env;
  const hint = String(aspectHint ?? '').toLowerCase();
  if (hint.includes('portrait') || hint.includes('vertical') || hint.includes('9:16')) return '720x1280';
  return '1280x720';
}

/**
 * @returns {string}
 */
export function getOpenAiVideoModel() {
  const model = String(process.env.OPENAI_VIDEO_MODEL ?? 'sora-2').trim();
  return model || 'sora-2';
}

/**
 * @param {{ prompt: string; seconds?: string; size?: string; model?: string }} params
 */
export async function createOpenAiVideoJob(params) {
  const apiKey = getApiKey();
  const body = {
    model: params.model ?? getOpenAiVideoModel(),
    prompt: params.prompt,
    seconds: params.seconds ?? normalizeOpenAiVideoSeconds(),
    size: params.size ?? normalizeOpenAiVideoSize(),
  };

  const res = await fetch(`${OPENAI_API_BASE}/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return parseJsonResponse(res);
}

/**
 * @param {string} videoId
 */
export async function retrieveOpenAiVideoJob(videoId) {
  const apiKey = getApiKey();
  const res = await fetch(`${OPENAI_API_BASE}/videos/${encodeURIComponent(videoId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return parseJsonResponse(res);
}

/**
 * @param {string} videoId
 * @param {'video' | 'thumbnail' | 'spritesheet'} [variant]
 * @returns {Promise<Buffer>}
 */
export async function downloadOpenAiVideoContent(videoId, variant = 'video') {
  const apiKey = getApiKey();
  const url = new URL(`${OPENAI_API_BASE}/videos/${encodeURIComponent(videoId)}/content`);
  if (variant && variant !== 'video') url.searchParams.set('variant', variant);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/binary',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw classifyOpenAiHttpError(new Error(text || `Download failed ${res.status}`), res.status);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * @param {Record<string, unknown>} job
 */
export function mapOpenAiJobStatus(job) {
  const status = String(job?.status ?? '').toLowerCase();
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'queued') return 'queued';
  return status || 'unknown';
}

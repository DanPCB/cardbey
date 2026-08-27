/**
 * MiniMax H3 V2 configuration — strict parse, no silent 2K upgrade.
 * Prices are estimates only (configurable metadata).
 */

export const MINIMAX_PROVIDER = 'minimax';
export const MINIMAX_MODEL_H3 = 'MiniMax-H3';
export const MINIMAX_DEFAULT_RESOLUTION = '768P';
export const MINIMAX_DEFAULT_DURATION_SECONDS = 6;
export const MINIMAX_DEFAULT_RATIO = '9:16';
export const MINIMAX_API_BASE_URL = 'https://api.minimax.io';

export const MINIMAX_SUPPORTED_RESOLUTIONS = Object.freeze(['768P']);
export const MINIMAX_DOCUMENTED_RESOLUTIONS = Object.freeze(['768P', '2K']);
export const MINIMAX_SUPPORTED_DURATIONS = Object.freeze([
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);
export const MINIMAX_T2V_RATIOS = Object.freeze(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
export const MINIMAX_ALL_RATIOS = Object.freeze(['adaptive', ...MINIMAX_T2V_RATIOS]);

const DEFAULT_USD_PER_SECOND_768P = 0.08;
const DEFAULT_USD_PER_SECOND_2K = 0.13;

export class MiniMaxConfigError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {string} [userMessage]
   */
  constructor(code, message, userMessage) {
    super(message);
    this.name = 'MiniMaxConfigError';
    this.code = code;
    this.userMessage = userMessage || message;
  }
}

export function isMinimaxH3Enabled(env = process.env) {
  const raw = String(env.ENABLE_MINIMAX_H3_VIDEO_V1 ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
}

export function readMinimaxApiKey(env = process.env) {
  return String(env.MINIMAX_API_KEY ?? '').trim();
}

export function isMinimaxConfigured(env = process.env) {
  return Boolean(readMinimaxApiKey(env));
}

export function isMinimaxSelectable(env = process.env) {
  return isMinimaxH3Enabled(env) && isMinimaxConfigured(env);
}

function parsePositiveNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readEstimatedUsdPerSecond(resolution, env = process.env) {
  if (resolution === '2K') {
    return parsePositiveNumber(env.MINIMAX_H3_USD_PER_SECOND_2K, DEFAULT_USD_PER_SECOND_2K);
  }
  return parsePositiveNumber(env.MINIMAX_H3_USD_PER_SECOND_768P, DEFAULT_USD_PER_SECOND_768P);
}

/**
 * Estimated cost only — not a billed invoice.
 * @param {{ durationSeconds: number, resolution: string }} opts
 */
export function estimateMinimaxCostUsd(opts, env = process.env) {
  const durationSeconds = Number(opts.durationSeconds);
  const resolution = String(opts.resolution || MINIMAX_DEFAULT_RESOLUTION);
  const usdPerSecond = readEstimatedUsdPerSecond(resolution, env);
  const amount = Math.round(durationSeconds * usdPerSecond * 100) / 100;
  return {
    amountUsd: amount,
    currency: 'USD',
    isEstimate: true,
    label: `Estimated provider cost: US$${amount.toFixed(2)}`,
    usdPerSecond,
    durationSeconds,
    resolution,
  };
}

function normalizeRatio(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value === '9/16') return '9:16';
  if (value === '16/9') return '16:9';
  if (value === '1/1') return '1:1';
  if (value === '4/3') return '4:3';
  if (value === '3/4') return '3:4';
  if (value === '21/9') return '21:9';
  return value;
}

function resolveDuration(requested, env) {
  const fromRequest = requested != null && requested !== '' ? Number(requested) : null;
  const fromEnv = env.MINIMAX_VIDEO_DURATION_SECONDS;
  const raw = fromRequest != null && Number.isFinite(fromRequest) ? fromRequest : Number(fromEnv);
  const duration = Number.isInteger(raw) ? raw : Number.isFinite(raw) ? Math.trunc(raw) : MINIMAX_DEFAULT_DURATION_SECONDS;
  if (!Number.isInteger(duration) || !MINIMAX_SUPPORTED_DURATIONS.includes(duration)) {
    throw new MiniMaxConfigError(
      'MINIMAX_UNSUPPORTED_DURATION',
      `MiniMax H3 duration must be an integer 4–15 seconds (got ${requested ?? fromEnv ?? duration}).`,
      'This video length is not supported for MiniMax H3. Use 4 to 15 seconds.',
    );
  }
  return duration;
}

function resolveResolution(requested, env) {
  const allow2k =
    String(env.MINIMAX_H3_ALLOW_2K ?? '').trim().toLowerCase() === 'true' ||
    String(env.MINIMAX_H3_ALLOW_2K ?? '').trim() === '1';
  const raw = String(requested || env.MINIMAX_VIDEO_RESOLUTION || MINIMAX_DEFAULT_RESOLUTION)
    .trim()
    .toUpperCase();
  const normalized = raw === '768' ? '768P' : raw === '2K' ? '2K' : raw;

  if (normalized === '2K') {
    if (!allow2k) {
      throw new MiniMaxConfigError(
        'MINIMAX_2K_BLOCKED',
        'MiniMax H3 2K is blocked during the pilot. Use 768P.',
        '2K video is not enabled for this MiniMax pilot. 768P is the supported setting.',
      );
    }
    return '2K';
  }
  if (normalized !== '768P') {
    throw new MiniMaxConfigError(
      'MINIMAX_UNSUPPORTED_RESOLUTION',
      `Unsupported MiniMax resolution "${requested || env.MINIMAX_VIDEO_RESOLUTION}". Pilot supports 768P only.`,
      'That video quality is not available for MiniMax H3 right now. Use 768P.',
    );
  }
  return '768P';
}

function resolveRatio({ requested, hasImageInput }) {
  if (hasImageInput) {
    return 'adaptive';
  }
  const ratio = normalizeRatio(requested) || MINIMAX_DEFAULT_RATIO;
  if (ratio === 'adaptive') {
    throw new MiniMaxConfigError(
      'MINIMAX_UNSUPPORTED_RATIO',
      'Text-to-video requires an explicit ratio (not adaptive).',
      'Choose a video shape such as 9:16 or 16:9.',
    );
  }
  if (!MINIMAX_T2V_RATIOS.includes(ratio)) {
    throw new MiniMaxConfigError(
      'MINIMAX_UNSUPPORTED_RATIO',
      `Unsupported MiniMax aspect ratio "${requested}".`,
      'That video shape is not supported. Use 9:16, 16:9, or 1:1.',
    );
  }
  return ratio;
}

/**
 * @param {object} [input]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveMinimaxGenerationSettings(input = {}, env = process.env) {
  if (!isMinimaxH3Enabled(env)) {
    throw new MiniMaxConfigError(
      'MINIMAX_FLAG_OFF',
      'ENABLE_MINIMAX_H3_VIDEO_V1 is off.',
      'MiniMax video is not enabled.',
    );
  }
  if (!isMinimaxConfigured(env)) {
    throw new MiniMaxConfigError(
      'MINIMAX_API_KEY_MISSING',
      'MINIMAX_API_KEY is not configured.',
      'MiniMax video is not connected yet.',
    );
  }

  const model = String(env.MINIMAX_VIDEO_MODEL || MINIMAX_MODEL_H3).trim() || MINIMAX_MODEL_H3;
  if (model !== MINIMAX_MODEL_H3) {
    throw new MiniMaxConfigError(
      'MINIMAX_UNSUPPORTED_MODEL',
      `Unsupported MiniMax model "${model}". Pilot supports MiniMax-H3 only.`,
      'This MiniMax model is not enabled.',
    );
  }

  const hasImageInput = Boolean(
    input.imageUrl ||
      input.firstFrameUrl ||
      input.lastFrameUrl ||
      input.image_url ||
      input.referenceImageUrl,
  );

  const durationSeconds = resolveDuration(
    input.duration ?? input.lengthSeconds ?? input.durationSeconds,
    env,
  );
  const resolution = resolveResolution(input.resolution, env);
  const aspectRatio = resolveRatio({
    requested: input.aspectRatio ?? input.ratio,
    hasImageInput,
  });
  const cost = estimateMinimaxCostUsd({ durationSeconds, resolution }, env);
  const apiBase = String(env.MINIMAX_API_BASE_URL || MINIMAX_API_BASE_URL).replace(/\/+$/, '');

  return {
    provider: MINIMAX_PROVIDER,
    model,
    durationSeconds,
    resolution,
    aspectRatio,
    hasImageInput,
    apiBase,
    costEstimate: cost,
    selectionReason: input.selectionReason || 'explicit_minimax_request',
  };
}

export function redactMinimaxSecrets(value, env = process.env) {
  const key = readMinimaxApiKey(env);
  if (!key) return value;
  const replace = (text) => String(text).split(key).join('[REDACTED_MINIMAX_API_KEY]');
  if (typeof value === 'string') return replace(value);
  try {
    return JSON.parse(replace(JSON.stringify(value)));
  } catch {
    return value;
  }
}

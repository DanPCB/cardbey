/**
 * Resolve configured video generation provider (explicit env or Kling auto-detect).
 * MiniMax is never auto-selected from MINIMAX_API_KEY — flag + explicit provider only.
 */

import { isMinimaxH3Enabled, isMinimaxConfigured } from './minimax/minimaxConfig.js';

/**
 * @returns {'mock' | 'openai' | 'kling' | 'minimax' | null}
 */
export function resolveVideoProvider(env = process.env) {
  const explicit = String(env.VIDEO_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'minimax') {
    if (isMinimaxH3Enabled(env)) return 'minimax';
    // Flag off: ignore MiniMax and keep existing Kling/OpenAI/mock behaviour.
  } else if (explicit === 'mock' || explicit === 'openai' || explicit === 'kling') {
    return explicit;
  }
  if (
    String(env.KLING_ACCESS_KEY ?? '').trim() &&
    String(env.KLING_SECRET_KEY ?? '').trim()
  ) {
    return 'kling';
  }
  return null;
}

/**
 * Request-level MiniMax selection for controlled tests. Does not replace Kling globally.
 * @param {object} [input]
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveRequestedVideoProvider(input = {}, env = process.env) {
  const requested = String(
    input.provider || input.approvedPlan?.provider || '',
  )
    .trim()
    .toLowerCase();
  if (requested === 'minimax' && isMinimaxH3Enabled(env)) {
    return 'minimax';
  }
  return resolveVideoProvider(env);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isVideoGenerationProviderAvailable(env = process.env) {
  const provider = resolveVideoProvider(env);
  if (!provider) return false;
  if (provider === 'mock') {
    return Boolean(String(env.VIDEO_ARTIFACT_MOCK_URL ?? '').trim());
  }
  if (provider === 'openai') {
    return Boolean(String(env.OPENAI_API_KEY ?? '').trim());
  }
  if (provider === 'kling') {
    return (
      Boolean(String(env.KLING_ACCESS_KEY ?? '').trim()) &&
      Boolean(String(env.KLING_SECRET_KEY ?? '').trim())
    );
  }
  if (provider === 'minimax') {
    return isMinimaxH3Enabled(env) && isMinimaxConfigured(env);
  }
  return false;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function videoProviderUnavailableReason(env = process.env) {
  if (isVideoGenerationProviderAvailable(env)) return null;
  const explicit = String(env.VIDEO_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'openai' && !String(env.OPENAI_API_KEY ?? '').trim()) {
    return 'OpenAI video is configured but OPENAI_API_KEY is missing.';
  }
  if (explicit === 'minimax') {
    if (!isMinimaxH3Enabled(env)) {
      return 'MiniMax H3 is configured but ENABLE_MINIMAX_H3_VIDEO_V1 is off.';
    }
    if (!isMinimaxConfigured(env)) {
      return 'MiniMax H3 is selected but MINIMAX_API_KEY is missing.';
    }
  }
  return 'Direct AI video is not connected yet (set VIDEO_GENERATION_PROVIDER or KLING_ACCESS_KEY + KLING_SECRET_KEY).';
}

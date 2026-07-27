/**
 * Resolve configured video generation provider (explicit env or Kling auto-detect).
 */

/**
 * @returns {'mock' | 'openai' | 'kling' | null}
 */
export function resolveVideoProvider(env = process.env) {
  const explicit = String(env.VIDEO_GENERATION_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'mock' || explicit === 'openai' || explicit === 'kling') {
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
  return 'Direct AI video is not connected yet (set VIDEO_GENERATION_PROVIDER or KLING_ACCESS_KEY + KLING_SECRET_KEY).';
}

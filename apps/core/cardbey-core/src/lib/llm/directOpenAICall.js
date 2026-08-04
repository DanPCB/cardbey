/**
 * Deprecation shim for direct OpenAI chat completions.
 * Phase 0: remaining bypasses must call through here so they are gateway-aware in logs.
 * Prefer llmGateway.complete / llmGateway.generate for all new text generation.
 */

const warnedCallers = new Set();

/**
 * @param {string} [caller]
 */
export function warnDirectOpenAICall(caller = 'unknown') {
  const key = String(caller || 'unknown');
  if (warnedCallers.has(key)) return;
  warnedCallers.add(key);
  console.warn(
    `[DEPRECATED] Direct OpenAI chat call from ${key}. Use llmGateway instead. ` +
      'Rollback: USE_LLM_GATEWAY=false. Phase 0 target: route all text-gen through llmGateway.',
  );
}

/**
 * @param {import('openai').default} openaiClient
 * @param {Record<string, unknown>} params
 * @param {string} [caller]
 */
export async function deprecatedOpenAIChatCompletion(openaiClient, params, caller = 'unknown') {
  warnDirectOpenAICall(caller);
  if (!openaiClient) {
    throw new Error('OpenAI client is not configured');
  }
  return openaiClient.chat.completions.create(params);
}

/** Reset one-shot warnings (tests). */
export function resetDirectOpenAICallWarnings() {
  warnedCallers.clear();
}

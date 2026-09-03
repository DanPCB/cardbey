/**
 * Bounded OCR resilience diagnostics (no API keys, no full image contents).
 */

/**
 * @param {{
 *   provider: string,
 *   attempt: number,
 *   classification: string,
 *   latencyMs?: number,
 *   fallbackTriggered?: boolean,
 * }} attempt
 */
export function recordVisionAttempt(attempt) {
  const payload = {
    provider: String(attempt?.provider || 'unknown'),
    attempt: Number(attempt?.attempt) || 0,
    classification: String(attempt?.classification || 'UNKNOWN'),
    latencyMs: Number.isFinite(attempt?.latencyMs) ? Math.round(attempt.latencyMs) : undefined,
    fallbackTriggered: Boolean(attempt?.fallbackTriggered),
  };
  console.info('[vision.resilience]', payload);
  return payload;
}

/**
 * @param {Array<object>} attempts
 * @param {string} finalClassification
 * @param {string} providerUsed
 */
export function recordVisionFallbackSummary(attempts, finalClassification, providerUsed) {
  console.info('[vision.resilience.summary]', {
    attempts: Array.isArray(attempts) ? attempts.length : 0,
    finalClassification: String(finalClassification || ''),
    providerUsed: String(providerUsed || ''),
    chain: Array.isArray(attempts)
      ? attempts.map((a) => `${a.provider}:${a.classification}`).join(' → ')
      : '',
  });
}

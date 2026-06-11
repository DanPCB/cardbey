/**
 * Go/no-go verdict logic for Intelligence Foundation staging bake.
 */

export const DEFAULT_THRESHOLDS = {
  minLlmSourceRate: Number(process.env.FOUNDATION_MIN_LLM_RATE ?? 0.8),
  maxExpressErrorRate: Number(process.env.FOUNDATION_MAX_EXPRESS_ERROR_RATE ?? 0.02),
  maxMemoryErrors: Number(process.env.FOUNDATION_MAX_MEMORY_ERRORS ?? 0),
  maxExpressP95Ms: Number(process.env.FOUNDATION_MAX_EXPRESS_P95_MS ?? 4000),
  minExpressSamples: Number(process.env.FOUNDATION_MIN_EXPRESS_SAMPLES ?? 50),
};

/**
 * @param {ReturnType<import('./foundationMetrics.js').snapshot>} metrics
 * @param {typeof DEFAULT_THRESHOLDS} [thresholds]
 */
export function evaluateGoNoGo(metrics, thresholds = DEFAULT_THRESHOLDS) {
  const express = metrics?.intelligence_express ?? {};
  const memory = metrics?.intelligence_memory ?? {};
  const bySource = express.bySource?.window ?? {};
  const llm = Number(bySource.llm ?? 0);
  const fallback = Number(bySource.fallback ?? 0);
  const expressTotal = llm + fallback;
  const hasEnoughSamples = expressTotal >= thresholds.minExpressSamples;
  const llmRate = expressTotal > 0 ? llm / expressTotal : 0;
  const expressErrors = Number(express.latencyMs?.window?.errors ?? 0);
  const expressErrorRate = expressTotal > 0 ? expressErrors / expressTotal : 0;
  const memoryErrors = Number(memory.byOutcome?.window?.error ?? 0);
  const expressP95 = express.latencyMs?.window?.p95 ?? 0;

  const checks = [
    {
      id: 'min_express_samples',
      label: `Express samples ≥ ${thresholds.minExpressSamples} (1h window)`,
      actual: `${expressTotal} requests`,
      pass: hasEnoughSamples,
      insufficientData: !hasEnoughSamples,
    },
    {
      id: 'llm_source_rate',
      label: `LLM source rate ≥ ${(thresholds.minLlmSourceRate * 100).toFixed(0)}%`,
      actual: !hasEnoughSamples
        ? 'skipped (insufficient data)'
        : `${(llmRate * 100).toFixed(1)}% (${llm}/${expressTotal})`,
      pass: !hasEnoughSamples ? false : llmRate >= thresholds.minLlmSourceRate,
    },
    {
      id: 'express_error_rate',
      label: `Express error rate < ${(thresholds.maxExpressErrorRate * 100).toFixed(0)}%`,
      actual: !hasEnoughSamples
        ? 'skipped (insufficient data)'
        : `${(expressErrorRate * 100).toFixed(2)}% (${expressErrors}/${expressTotal})`,
      pass: !hasEnoughSamples ? false : expressErrorRate < thresholds.maxExpressErrorRate,
    },
    {
      id: 'memory_errors',
      label: `Memory outcome error = ${thresholds.maxMemoryErrors}`,
      actual: String(memoryErrors),
      pass: memoryErrors <= thresholds.maxMemoryErrors,
    },
    {
      id: 'express_p95_latency',
      label: `Express p95 latency < ${thresholds.maxExpressP95Ms}ms`,
      actual: !hasEnoughSamples
        ? 'skipped (insufficient data)'
        : expressP95 == null
          ? 'n/a'
          : `${expressP95}ms`,
      pass: !hasEnoughSamples ? false : expressP95 == null || expressP95 < thresholds.maxExpressP95Ms,
    },
  ];

  const insufficientData = !hasEnoughSamples;
  const pass = !insufficientData && checks.every((c) => c.pass);
  return { pass, insufficientData, checks, thresholds, expressTotal };
}

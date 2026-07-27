import { describe, expect, it } from 'vitest';
import { evaluateGoNoGo } from './foundationGoNoGo.js';

describe('foundationGoNoGo', () => {
  const thresholds = {
    minLlmSourceRate: 0.8,
    maxExpressErrorRate: 0.02,
    maxMemoryErrors: 0,
    maxExpressP95Ms: 4000,
    minExpressSamples: 50,
  };

  it('fails with insufficient data when express window is below min samples', () => {
    const verdict = evaluateGoNoGo(
      {
        intelligence_express: {
          bySource: { window: { llm: 10, fallback: 0 } },
          latencyMs: { window: { errors: 0, p95: 500 } },
        },
        intelligence_memory: { byOutcome: { window: { error: 0 } } },
      },
      thresholds,
    );
    expect(verdict.insufficientData).toBe(true);
    expect(verdict.pass).toBe(false);
    expect(verdict.checks.find((c) => c.id === 'min_express_samples')?.pass).toBe(false);
  });

  it('passes when all window metrics meet thresholds', () => {
    const verdict = evaluateGoNoGo(
      {
        intelligence_express: {
          bySource: { window: { llm: 45, fallback: 10 } },
          latencyMs: { window: { errors: 0, p95: 1200 } },
        },
        intelligence_memory: {
          byOutcome: { window: { hydrated: 50, error: 0 } },
        },
      },
      thresholds,
    );
    expect(verdict.insufficientData).toBe(false);
    expect(verdict.pass).toBe(true);
    expect(verdict.checks.every((c) => c.pass)).toBe(true);
  });

  it('fails when LLM rate is below 80%', () => {
    const verdict = evaluateGoNoGo(
      {
        intelligence_express: {
          bySource: { window: { llm: 30, fallback: 30 } },
          latencyMs: { window: { errors: 0, p95: 1000 } },
        },
        intelligence_memory: { byOutcome: { window: { error: 0 } } },
      },
      thresholds,
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.checks.find((c) => c.id === 'llm_source_rate')?.pass).toBe(false);
  });

  it('fails when memory errors are present', () => {
    const verdict = evaluateGoNoGo(
      {
        intelligence_express: {
          bySource: { window: { llm: 60, fallback: 0 } },
          latencyMs: { window: { errors: 0, p95: 500 } },
        },
        intelligence_memory: { byOutcome: { window: { error: 2 } } },
      },
      thresholds,
    );
    expect(verdict.checks.find((c) => c.id === 'memory_errors')?.pass).toBe(false);
  });

  it('fails when express p95 exceeds 4s', () => {
    const verdict = evaluateGoNoGo(
      {
        intelligence_express: {
          bySource: { window: { llm: 60, fallback: 0 } },
          latencyMs: { window: { errors: 0, p95: 5000 } },
        },
        intelligence_memory: { byOutcome: { window: { error: 0 } } },
      },
      thresholds,
    );
    expect(verdict.checks.find((c) => c.id === 'express_p95_latency')?.pass).toBe(false);
  });
});

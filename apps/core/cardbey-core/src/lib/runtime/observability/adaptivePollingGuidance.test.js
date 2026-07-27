import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAdaptivePollingGuidance } from './adaptivePollingGuidance.js';

describe('buildAdaptivePollingGuidance', () => {
  const prev = process.env.PERFORMER_ADAPTIVE_POLLING;

  beforeEach(() => {
    process.env.PERFORMER_ADAPTIVE_POLLING = 'true';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PERFORMER_ADAPTIVE_POLLING;
    else process.env.PERFORMER_ADAPTIVE_POLLING = prev;
  });

  it('returns null when adaptive polling flag is off', () => {
    process.env.PERFORMER_ADAPTIVE_POLLING = 'false';
    expect(buildAdaptivePollingGuidance({ sseHealthy: true })).toBeNull();
  });

  it('STREAM_PRIMARY with long interval when SSE healthy', () => {
    const g = buildAdaptivePollingGuidance({ sseHealthy: true, lastSseEventAgeMs: 2000 });
    expect(g?.pollingMode).toBe('STREAM_PRIMARY');
    expect(g?.recommendedPollIntervalMs).toBeGreaterThanOrEqual(20_000);
    expect(g?.preferSse).toBe(true);
    expect(g?.executable).toBe(false);
  });

  it('POLL_FALLBACK with shorter interval when SSE unhealthy', () => {
    const g = buildAdaptivePollingGuidance({ sseHealthy: false, orchestrationActive: true });
    expect(g?.pollingMode).toBe('POLL_FALLBACK');
    expect(g?.recommendedPollIntervalMs).toBeLessThanOrEqual(4_000);
  });

  it('RECOVERY_MODE during SSE catch-up window', () => {
    const g = buildAdaptivePollingGuidance({ sseHealthy: true, lastSseEventAgeMs: 30_000 });
    expect(g?.pollingMode).toBe('RECOVERY_MODE');
    expect(g?.recommendedPollIntervalMs).toBeLessThan(4_000);
  });
});

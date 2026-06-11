import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  record,
  recordRouteLatency,
  snapshot,
  resetFoundationMetrics,
  WINDOW_MS,
} from './foundationMetrics.js';

describe('foundationMetrics', () => {
  beforeEach(() => {
    resetFoundationMetrics();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('increments counters and exposes snapshot shape', () => {
    record('intelligence_express_total', { source: 'llm', surface: 'pil' });
    record('intelligence_express_total', { source: 'fallback', reason: 'validation_failed', surface: 'pil' });
    record('intelligence_memory_total', { outcome: 'hydrated' });
    record('pil_concierge_interpret_total', { source: 'llm' });
    record('pil_event_ingest_total', { eventType: 'pwa_installed' });

    const snap = snapshot();
    expect(snap.generatedAt).toBeTruthy();
    expect(snap.windowMs).toBe(WINDOW_MS);
    expect(snap.intelligence_express.bySource.totals.llm).toBe(1);
    expect(snap.intelligence_express.bySource.totals.fallback).toBe(1);
    expect(snap.intelligence_express.byFallbackReason.totals.validation_failed).toBe(1);
    expect(snap.intelligence_memory.byOutcome.totals.hydrated).toBe(1);
    expect(snap.pil_concierge_interpret.bySource.totals.llm).toBe(1);
    expect(snap.pil_event_ingest.byEventType.totals.pwa_installed).toBe(1);
  });

  it('computes latency percentiles and error counts', () => {
    recordRouteLatency('intelligence_express', 100);
    recordRouteLatency('intelligence_express', 200);
    recordRouteLatency('intelligence_express', 3000, { error: true });
    recordRouteLatency('intelligence_express', 4000);

    const snap = snapshot();
    expect(snap.intelligence_express.latencyMs.totals.count).toBe(4);
    expect(snap.intelligence_express.latencyMs.totals.p50).toBe(200);
    expect(snap.intelligence_express.latencyMs.totals.p95).toBe(4000);
    expect(snap.intelligence_express.latencyMs.window.errors).toBe(1);
  });

  it('rolls window events out after 1h', () => {
    record('intelligence_express_total', { source: 'llm' });
    expect(snapshot().intelligence_express.window).toBe(1);

    vi.setSystemTime(new Date('2026-06-10T13:01:00.000Z'));
    record('intelligence_express_total', { source: 'llm' });

    const snap = snapshot();
    expect(snap.intelligence_express.window).toBe(1);
    expect(snap.intelligence_express.total).toBe(2);
  });

  it('never throws from record()', () => {
    const broken = { source: 'llm' };
    Object.defineProperty(broken, 'source', {
      get() {
        throw new Error('boom');
      },
    });
    expect(() => record('intelligence_express_total', broken)).not.toThrow();
  });
});

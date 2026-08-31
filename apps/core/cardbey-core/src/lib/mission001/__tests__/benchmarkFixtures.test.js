/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  benchmarkFixtureCount,
  MISSION001_BENCHMARK_FIXTURES,
  MISSION001_LIVE_INPUTS,
  normalizeBenchmarkRow,
  resolveLiveInput,
  summarizeBenchmarkRows,
} from '../benchmarkFixtures.js';

describe('Mission001 Gate 10 — benchmark fixtures', () => {
  it('defines at least 30 representative businesses', () => {
    expect(benchmarkFixtureCount()).toBeGreaterThanOrEqual(30);
    expect(MISSION001_BENCHMARK_FIXTURES.length).toBeGreaterThanOrEqual(30);
  });

  it('provides live public inputs for every fixture id', () => {
    for (const fixture of MISSION001_BENCHMARK_FIXTURES) {
      expect(MISSION001_LIVE_INPUTS[fixture.id]?.businessName).toBeTruthy();
      const live = resolveLiveInput(fixture);
      expect(live.businessName.length).toBeGreaterThan(2);
    }
  });

  it('normalizes benchmark result rows', () => {
    const row = normalizeBenchmarkRow({
      id: 'cafe-strong-web',
      inputType: 'website',
      evidenceQuality: 'strong',
      totalMs: 52000,
      fidelityScore: 81,
    });
    expect(row.business).toBe('cafe-strong-web');
    expect(row.generationTime).toBe(52000);
    expect(row.finalStatus).toBe('pending');
  });

  it('summarizes launch metrics including P50/P90', () => {
    const summary = summarizeBenchmarkRows([
      normalizeBenchmarkRow({ generationTime: 40000, fidelityScore: 80, catalogGrounding: 90, finalStatus: 'accepted' }),
      normalizeBenchmarkRow({ generationTime: 55000, fidelityScore: 70, catalogGrounding: 60, finalStatus: 'accepted' }),
      normalizeBenchmarkRow({ generationTime: 90000, fidelityScore: 85, catalogGrounding: 80, finalStatus: 'needs_review' }),
    ]);
    expect(summary.fixtureCount).toBe(3);
    expect(summary.p50Ms).toBe(55000);
    expect(summary.p90Ms).toBe(90000);
    expect(summary.medianFidelity).toBe(80);
  });
});

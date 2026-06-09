import { describe, it, expect } from 'vitest';
import { execute as analyzeOfferPerformance } from '../../toolExecutors/offer/analyze_offer_performance.js';
import { execute as suggestOfferImprovements } from '../../toolExecutors/offer/suggest_offer_improvements.js';
import { execute as applyOfferOptimization } from '../../toolExecutors/offer/apply_offer_optimization.js';
import { execute as trackOfferOutcome } from '../../toolExecutors/offer/track_offer_outcome.js';

describe('offer executors', () => {
  it('analyze_offer_performance returns metrics and weakPoints', async () => {
    const result = await analyzeOfferPerformance({
      storeId: 'store-alpha',
      offerId: 'offer-1',
      lookbackDays: 7,
    });

    expect(result.status).toBe('ok');
    expect(result.output?.analysis?.storeId).toBe('store-alpha');
    expect(result.output?.analysis?.offerId).toBe('offer-1');
    expect(result.output?.analysis?.period?.days).toBe(7);
    expect(result.output?.analysis?.metrics).toMatchObject({
      impressions: expect.any(Number),
      clicks: expect.any(Number),
      conversions: expect.any(Number),
      conversionRate: expect.any(Number),
      revenue: expect.any(Number),
    });
    expect(Array.isArray(result.output?.analysis?.weakPoints)).toBe(true);
    expect(result.output?.analysis?.weakPoints.length).toBeGreaterThan(0);
  });

  it('suggest_offer_improvements returns 3 ranked suggestions', async () => {
    const analysis = {
      weakPoints: ['low CTR', 'low impressions', 'low conversions'],
    };

    const result = await suggestOfferImprovements({
      storeId: 'store-1',
      analysis,
      tone: 'friendly',
    });

    expect(result.status).toBe('ok');
    expect(result.output?.suggestions).toHaveLength(3);
    expect(result.output?.suggestions?.[0]?.rank).toBe(1);
    expect(result.output?.suggestions?.[1]?.rank).toBe(2);
    expect(result.output?.suggestions?.[2]?.rank).toBe(3);
    expect(result.output?.suggestions?.every((s) => s.autoApply === false)).toBe(true);
  });

  it('suggest returns type copy when weakPoints includes low CTR', async () => {
    const result = await suggestOfferImprovements({
      analysis: { weakPoints: ['low CTR'] },
      tone: 'bold',
    });

    const copySuggestion = result.output?.suggestions?.find((s) => s.type === 'copy');
    expect(copySuggestion).toBeTruthy();
    expect(copySuggestion?.title).toContain('call-to-action');
  });

  it('apply_offer_optimization requiresConfirmation when confirmed false and autoApply false', async () => {
    const suggestion = {
      id: 'sug-1',
      type: 'copy',
      title: 'Test',
      autoApply: false,
    };

    const result = await applyOfferOptimization({
      storeId: 'store-1',
      suggestion,
      confirmed: false,
    });

    expect(result.status).toBe('ok');
    expect(result.output?.applied).toBe(false);
    expect(result.output?.requiresConfirmation).toBe(true);
    expect(result.output?.suggestion).toEqual(suggestion);
  });

  it('apply_offer_optimization applied true when confirmed true', async () => {
    const suggestion = {
      id: 'sug-1',
      type: 'copy',
      title: 'Test',
      autoApply: false,
    };

    const result = await applyOfferOptimization({
      storeId: 'store-1',
      suggestion,
      confirmed: true,
    });

    expect(result.status).toBe('ok');
    expect(result.output?.applied).toBe(true);
    expect(result.output?.requiresConfirmation).toBe(false);
    expect(result.output?.appliedAt).toBeTruthy();
  });

  it('track_offer_outcome returns trackingId and nextReviewAt', async () => {
    const result = await trackOfferOutcome({
      storeId: 'store-1',
      offerId: 'offer-1',
      optimizationId: 'opt-1',
      baselineMetrics: { impressions: 100, clicks: 10 },
      suggestion: { id: 'opt-1', type: 'copy' },
    });

    expect(result.status).toBe('ok');
    expect(result.output?.tracked).toBe(true);
    expect(result.output?.trackingId).toBeTruthy();
    expect(result.output?.nextReviewAt).toBeTruthy();
    expect(new Date(result.output.nextReviewAt).getTime()).toBeGreaterThan(Date.now());
  });
});

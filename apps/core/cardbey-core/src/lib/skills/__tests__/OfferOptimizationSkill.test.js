import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { OfferOptimizationSkill } from '../definitions/OfferOptimizationSkill.js';

describe('OfferOptimizationSkill', () => {
  it("registers under 'offer_optimization'", () => {
    expect(skillRegistry.has('offer_optimization')).toBe(true);
    expect(skillRegistry.get('offer_optimization')?.name).toBe('offer_optimization');
  });

  it('findByTrigger(optimize_offer) returns OfferOptimizationSkill', () => {
    expect(skillRegistry.findByTrigger('optimize_offer')?.name).toBe('offer_optimization');
  });

  it('findByTrigger(boost_campaign) returns OfferOptimizationSkill', () => {
    expect(skillRegistry.findByTrigger('boost_campaign')?.name).toBe('offer_optimization');
  });

  it('has 4 steps with correct tool names', () => {
    const steps = OfferOptimizationSkill.steps;
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.tool)).toEqual([
      'analyze_offer_performance',
      'suggest_offer_improvements',
      'apply_offer_optimization',
      'track_offer_outcome',
    ]);
  });

  it('apply condition is false when suggestions empty', () => {
    const step = OfferOptimizationSkill.steps.find((s) => s.id === 'apply');
    expect(step?.condition?.({}, { suggest: { output: { suggestions: [] } } })).toBe(false);
    expect(
      step?.condition?.({}, { suggest: { output: { suggestions: [{ id: 's1' }] } } }),
    ).toBe(true);
  });

  it('track condition is false when apply.applied is not true', () => {
    const step = OfferOptimizationSkill.steps.find((s) => s.id === 'track');
    expect(step?.condition?.({}, { apply: { output: { applied: false } } })).toBe(false);
    expect(step?.condition?.({}, { apply: { output: { applied: true } } })).toBe(true);
  });

  it('retryPolicy shouldRetry is false for PERMISSION_DENIED', () => {
    const shouldRetry = OfferOptimizationSkill.retryPolicy?.shouldRetry;
    expect(shouldRetry?.({ code: 'PERMISSION_DENIED' })).toBe(false);
    expect(shouldRetry?.({ code: 'VALIDATION_ERROR' })).toBe(false);
    expect(shouldRetry?.({ code: 'TIMEOUT' })).toBe(true);
  });
});

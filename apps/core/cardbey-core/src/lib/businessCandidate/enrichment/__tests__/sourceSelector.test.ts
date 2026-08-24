import { afterEach, describe, expect, it } from 'vitest';
import {
  assessEnrichmentGaps,
  buildSourceFetchPlan,
  countPlannedFetches,
  isNameTruncated,
  splitFetchBudgetForHeroReserve,
} from '../sourceSelector.js';

describe('sourceSelector', () => {
  afterEach(() => {
    delete process.env.ENRICHMENT_BROADER_SOURCES;
  });

  it('detects truncated name ending with &', () => {
    expect(isNameTruncated('Churchill Cellars Licensed Bar, Bottle Shop &')).toBe(true);
  });

  it('assessEnrichmentGaps flags thin description and missing hero', () => {
    const gaps = assessEnrichmentGaps({
      name: 'Cafe Jc',
      description: 'Cafe Jc is a local food in Braybrook.',
      heroImageUrl: null,
      category: 'Other',
      openingHours: null,
      rawSourceJson: null,
    });
    expect(gaps.needsDescription).toBe(true);
    expect(gaps.needsHero).toBe(true);
    expect(gaps.needsCategory).toBe(true);
    expect(gaps.needsHours).toBe(true);
  });

  it('buildSourceFetchPlan never exceeds remaining budget', () => {
    const gaps = {
      needsDescription: true,
      needsHero: true,
      needsFullName: true,
      needsCategory: true,
      needsHours: true,
    };
    const plan = buildSourceFetchPlan(gaps, false, 3);
    expect(countPlannedFetches(plan)).toBeLessThanOrEqual(3);
    expect(plan.fetchOSM).toBe(true);
    expect(plan.fetchFoursquare).toBe(true);
  });

  it('buildSourceFetchPlan with zero budget schedules nothing', () => {
    const plan = buildSourceFetchPlan(
      {
        needsDescription: true,
        needsHero: true,
        needsFullName: true,
        needsCategory: true,
        needsHours: true,
      },
      false,
      0,
    );
    expect(countPlannedFetches(plan)).toBe(0);
  });

  it('splitFetchBudgetForHeroReserve holds slots for Pexels when hero needed', () => {
    const split = splitFetchBudgetForHeroReserve(4, {
      needsHero: true,
      pexelsConfigured: true,
      reserveSlots: 2,
    });
    expect(split.heroReserve).toBe(2);
    expect(split.remainingForSources).toBe(2);
  });

  it('splitFetchBudgetForHeroReserve is zero when Pexels unset', () => {
    const split = splitFetchBudgetForHeroReserve(4, {
      needsHero: true,
      pexelsConfigured: false,
      reserveSlots: 2,
    });
    expect(split.heroReserve).toBe(0);
    expect(split.remainingForSources).toBe(4);
  });
});

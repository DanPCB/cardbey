import { describe, expect, it } from 'vitest';
import { mapBundleToStepMemory } from '../loadStepMemory.js';

describe('loadStepMemory', () => {
  it('maps facade bundle into runtime memory shape', () => {
    const memory = mapBundleToStepMemory(
      {
        activeSummary: 'Campaign draft ready',
        keyFacts: ['12 products'],
        business: { recentOutcomes: [{ success: true, action: 'launch_campaign' }] },
        suitcase: [{ id: 'a1', title: 'Hero banner', sourceType: 'image' }],
        session: { learnedSignals: ['high_intent'] },
        meta: { partial: false },
      },
      { loaded: true, loadTimeMs: 8 },
    );

    expect(memory.activeSummary).toBe('Campaign draft ready');
    expect(memory.keyFacts).toEqual(['12 products']);
    expect(memory.businessOutcomes).toHaveLength(1);
    expect(memory.suitcaseItems).toHaveLength(1);
    expect(memory.learnedSignals).toContain('high_intent');
    expect(memory._metadata?.loaded).toBe(true);
  });

  it('returns fallback metadata when bundle is null', () => {
    const memory = mapBundleToStepMemory(null, {
      loaded: false,
      partial: true,
      error: 'timeout',
      fallback: true,
    });

    expect(memory.keyFacts).toEqual([]);
    expect(memory._metadata?.fallback).toBe(true);
    expect(memory._metadata?.partial).toBe(true);
  });
});

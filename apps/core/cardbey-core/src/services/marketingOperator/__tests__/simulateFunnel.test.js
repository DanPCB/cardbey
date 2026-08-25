import { describe, expect, it, beforeEach, vi } from 'vitest';

const state = { touches: [], conversions: [] };

vi.mock('../repository.js', () => ({
  marketingRepo: {
    attributionTouch: {
      create: async (data) => {
        const row = { id: `t_${state.touches.length + 1}`, ...data };
        state.touches.push(row);
        return row;
      },
      findFirst: async () => state.touches[state.touches.length - 1] || null,
    },
    conversion: {
      findFirst: async ({ where }) =>
        state.conversions.find((c) => c.dedupeKey && c.dedupeKey === where.dedupeKey) || null,
      create: async (data) => {
        const row = { id: `cv_${state.conversions.length + 1}`, ...data };
        state.conversions.push(row);
        return row;
      },
    },
  },
}));

import { simulateFunnelForPilot, associateConversion } from '../attributionService.js';
import { CONVERSION_EVENTS } from '../constants.js';

describe('marketingOperator/simulate funnel', () => {
  beforeEach(() => {
    state.touches = [];
    state.conversions = [];
  });

  it('creates simulated conversions for full funnel', async () => {
    const result = await simulateFunnelForPilot('camp1', { visitorKey: 'v_sim' });
    expect(result.ok).toBe(true);
    expect(result.conversions.length).toBe(6);
    expect(result.conversions.every((c) => c.simulated === true)).toBe(true);
    expect(result.conversions.map((c) => c.eventType)).toContain(CONVERSION_EVENTS.LANDING_VISIT);
    expect(result.conversions.map((c) => c.eventType)).toContain(CONVERSION_EVENTS.SEVEN_DAY_RETURN);
  });

  it('dedupes by dedupeKey', async () => {
    const first = await associateConversion({
      campaignId: 'camp1',
      eventType: 'registration',
      dedupeKey: 'd1',
      simulated: true,
    });
    const second = await associateConversion({
      campaignId: 'camp1',
      eventType: 'REGISTRATION',
      dedupeKey: 'd1',
      simulated: true,
    });
    expect(first.ok).toBe(true);
    expect(second.deduped).toBe(true);
    expect(state.conversions).toHaveLength(1);
  });
});

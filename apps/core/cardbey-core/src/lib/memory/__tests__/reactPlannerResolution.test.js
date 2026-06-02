import { describe, expect, it } from 'vitest';
import { reactPlanner } from '../../intake/reactPlanner.js';
import { createEmptyHydratedContext } from '../memoryHydrator.js';

describe('reactPlanner resolution errors', () => {
  it('AMBIGUOUS store -> ask with candidate names (not generic picker)', async () => {
    const hydratedContext = createEmptyHydratedContext('update my store', {
      userId: 'u1',
      missionId: 'm1',
    });
    hydratedContext.resolution = {
      confidence: 'low',
      errors: [
        {
          entityType: 'store',
          ref: 'my cafe',
          reason: 'AMBIGUOUS',
          candidates: [
            { id: 'a', name: 'Alpha Cafe' },
            { id: 'b', name: 'Beta Cafe' },
          ],
        },
      ],
    };

    const out = await reactPlanner({
      hydratedContext,
      classification: { tool: 'update_store_hero' },
      toolRegistry: [
        {
          toolName: 'update_store_hero',
          approvalRequired: true,
          riskLevel: 'state_change',
          parameterSchema: { required: ['storeId'], properties: { storeId: { type: 'string' } } },
        },
      ],
    });

    expect(out.kind).toBe('ask');
    expect(out.prompt).toContain('Alpha Cafe');
    expect(out.prompt).not.toMatch(/please select a store first/i);
  });
});

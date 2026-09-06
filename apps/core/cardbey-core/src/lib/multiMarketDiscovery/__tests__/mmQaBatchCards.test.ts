import { describe, expect, it } from 'vitest';
import {
  buildMultiMarketQaBatchCard,
  sortMultiMarketQaBatchCards,
} from '../mmQaBatchCards.js';

describe('mmQaBatchCards', () => {
  it('uses inventory total for discovered, not provider hits', () => {
    const card = buildMultiMarketQaBatchCard(
      {
        batchId: 'MM_VN_x_abc_def',
        discoveredCount: 10,
        dryRun: false,
        jobStatus: 'success',
      },
      { total: 0, byStatus: {} },
    );
    expect(card.discovered).toBe(0);
    expect(card.providerHits).toBe(10);
    expect(card.pendingQa).toBe(0);
  });

  it('counts PENDING_QA + DISCOVERED as pendingQa', () => {
    const card = buildMultiMarketQaBatchCard(
      { batchId: 'MM_VN_x_abc_def', discoveredCount: 10 },
      { total: 10, byStatus: { PENDING_QA: 7, DISCOVERED: 3 } },
    );
    expect(card.discovered).toBe(10);
    expect(card.pendingQa).toBe(10);
  });

  it('sorts pendingQa desc, live before dry-run', () => {
    const sorted = sortMultiMarketQaBatchCards([
      { pendingQa: 0, dryRun: false, completedAt: '2026-09-06T12:00:00.000Z', id: 'empty-live' },
      { pendingQa: 10, dryRun: false, completedAt: '2026-09-05T12:00:00.000Z', id: 'full' },
      { pendingQa: 0, dryRun: true, completedAt: '2026-09-06T13:00:00.000Z', id: 'dry' },
    ]);
    expect(sorted.map((b) => b.id)).toEqual(['full', 'empty-live', 'dry']);
  });
});

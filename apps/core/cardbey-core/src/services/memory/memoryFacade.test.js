import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../businessMemory/businessMemoryService.js', () => ({
  getBusinessMemorySummary: vi.fn(),
}));

vi.mock('../suitcase/suitcaseItemService.js', () => ({
  listSuitcaseItems: vi.fn(),
}));

vi.mock('../user/userMemoryService.js', () => ({
  getUserMemory: vi.fn(),
}));

vi.mock('../pilEventsService.js', () => ({
  getRecentPilEvents: vi.fn(),
}));

vi.mock('./getMissionMemorySnapshot.js', () => ({
  getMissionMemorySnapshot: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({})),
  prisma: {},
}));

vi.mock('../../lib/metrics/foundationMetrics.js', () => ({
  record: vi.fn(),
}));

import { getBusinessMemorySummary } from '../businessMemory/businessMemoryService.js';
import { listSuitcaseItems } from '../suitcase/suitcaseItemService.js';
import { getUserMemory } from '../user/userMemoryService.js';
import { getRecentPilEvents } from '../pilEventsService.js';
import { getMissionMemorySnapshot } from './getMissionMemorySnapshot.js';
import memoryFacade, { normalizeMemoryContext } from './memoryFacade.js';
import { clearMemoryCacheForTests } from './memoryCache.js';

describe('memoryFacade', () => {
  beforeEach(() => {
    clearMemoryCacheForTests();
    vi.clearAllMocks();

    getBusinessMemorySummary.mockResolvedValue({
      recentObservations: [],
      recentOpportunities: [],
      recentDecisions: [],
      recentActions: [{ type: 'test' }],
      recentOutcomes: [],
      learnedSignals: ['signal-a'],
    });
    listSuitcaseItems.mockResolvedValue({
      items: [{ id: 's1', sourceType: 'upload', title: 'Doc', createdAt: new Date() }],
    });
    getUserMemory.mockResolvedValue({
      preferences: {},
      recentVisits: [],
      savedItems: [],
      abandonedTasks: [],
      completedTasks: [],
    });
    getRecentPilEvents.mockResolvedValue([
      { type: 'attention_signal', timestamp: new Date(), entityType: 'store', entityId: 'st1' },
    ]);
    getMissionMemorySnapshot.mockResolvedValue({
      missionId: 'm1',
      status: 'active',
      type: 'store_mission',
      steps: [],
      blackboard: {},
    });
  });

  it('returns bundle with all memory sources for store owner context', async () => {
    const context = {
      actor: { type: 'store_owner', id: 'user-123' },
      storeId: 'store-456',
      sessionId: 'session-789',
      missionId: 'm1',
    };

    const bundle = await memoryFacade.getBundle(context);

    expect(bundle).toHaveProperty('business');
    expect(bundle).toHaveProperty('suitcase');
    expect(bundle).toHaveProperty('user');
    expect(bundle).toHaveProperty('session');
    expect(bundle).toHaveProperty('mission');
    expect(bundle).toHaveProperty('meta');
    expect(bundle.meta.partial).toBe(false);
    expect(bundle.meta.sources).toContain('businessMemory');
    expect(bundle.meta.sources).toContain('suitcase');
    expect(bundle.meta.sources).toContain('userMemory');
    expect(bundle.meta.sources).toContain('pilEvents');
    expect(bundle.meta.sources).toContain('missionContext');
  });

  it('caches results for subsequent requests', async () => {
    const context = { actor: { type: 'guest', id: null }, storeId: null, sessionId: null };

    const first = await memoryFacade.getBundle(context);
    const second = await memoryFacade.getBundle(context);

    expect(first.meta.fetchedAt).toBe(second.meta.fetchedAt);
    expect(second.meta.cacheHit).toBe(true);
  });

  it('handles partial failures gracefully', async () => {
    getBusinessMemorySummary.mockRejectedValue(new Error('DB error'));

    const context = {
      actor: { type: 'store_owner', id: 'user-123' },
      storeId: 'store-456',
      sessionId: null,
    };

    const bundle = await memoryFacade.getBundle(context);

    expect(bundle.business).toBeNull();
    expect(bundle.meta.partial).toBe(true);
    expect(bundle.meta.sources).not.toContain('businessMemory');
  });

  it('normalizes actor.userId into actor.id', () => {
    const ctx = normalizeMemoryContext({
      actor: { type: 'consumer', userId: 'u-1' },
      storeId: 's-1',
    });

    expect(ctx.actor.id).toBe('u-1');
    expect(ctx.ownerId).toBe('u-1');
  });
});

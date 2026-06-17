import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  observation: {
    findMany: vi.fn(),
  },
  copilotSuggestion: {
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

vi.mock('../../lib/runtime/observationBus.js', () => ({
  default: {
    getLatest: vi.fn(() => []),
  },
}));

import suggestionEngine from './suggestionEngine.js';

describe('suggestionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.copilotSuggestion.findFirst.mockResolvedValue(null);
    prismaMock.copilotSuggestion.create.mockResolvedValue({});
    prismaMock.copilotSuggestion.findMany.mockResolvedValue([]);
  });

  it('identifies repeated failure and inventory patterns', () => {
    const patterns = suggestionEngine.identifyPatterns([
      { actionType: 'check_inventory', outcome: 'success' },
      { actionType: 'check_inventory', outcome: 'success' },
      { actionType: 'check_inventory', outcome: 'success' },
      { actionType: 'publish_store', outcome: 'failure' },
      { actionType: 'delete_product', outcome: 'failure' },
    ]);

    const types = patterns.map((p) => p.type);
    expect(types).toContain('low_inventory');
    expect(types).toContain('repeated_failures');
    expect(types).toContain('publish_retry');
  });

  it('scan queues suggestions when enough observations exist', async () => {
    prismaMock.observation.findMany.mockResolvedValue([
      { actionType: 'check_inventory', outcome: 'success' },
      { actionType: 'check_inventory', outcome: 'success' },
      { actionType: 'check_inventory', outcome: 'success' },
      { actionType: 'publish_store', outcome: 'failure' },
      { actionType: 'delete_product', outcome: 'failure' },
    ]);

    await suggestionEngine.scan();

    expect(prismaMock.copilotSuggestion.create).toHaveBeenCalled();
    const createdTypes = prismaMock.copilotSuggestion.create.mock.calls.map(
      (call) => call[0].data.type,
    );
    expect(createdTypes).toContain('restock');
    expect(createdTypes).toContain('diagnose');
    expect(createdTypes).toContain('publish');
  });

  it('getPendingSuggestions returns pending rows', async () => {
    prismaMock.copilotSuggestion.findMany.mockResolvedValue([
      { id: 's1', title: 'Test', status: 'pending' },
    ]);

    const rows = await suggestionEngine.getPendingSuggestions('user-1', 3);
    expect(rows).toHaveLength(1);
    expect(prismaMock.copilotSuggestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending' }),
        take: 3,
      }),
    );
  });
});

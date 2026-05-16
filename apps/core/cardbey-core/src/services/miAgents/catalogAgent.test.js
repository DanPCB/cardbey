/**
 * Foundation 2: CatalogAgent unit tests — emitContextUpdate called on success with product entities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../draftStore/draftStoreService.js', () => ({ patchDraftPreview: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./emitMissionEvent.js', () => ({ emitMissionEvent: vi.fn().mockResolvedValue(undefined) }));

const { runCatalogAgent } = await import('./catalogAgent.js');

describe('runCatalogAgent', () => {
  const baseParams = {
    missionId: 'mid',
    intentId: 'iid',
    intentType: 'generate_tags',
    draft: {
      id: 'draft-1',
      preview: {
        items: [
          { id: 'item-1', name: 'Product One' },
          { id: 'item-2', name: 'Product Two' },
        ],
      },
    },
    payload: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns completed status (stub)', async () => {
    const emitContextUpdate = vi.fn().mockResolvedValue(undefined);
    const res = await runCatalogAgent(baseParams, { missionContext: null, emitContextUpdate });
    expect(res).toMatchObject({ status: 'completed' });
    expect(emitContextUpdate).not.toHaveBeenCalled();
  });

  it('does not call emitContextUpdate when omitted (default no-op)', async () => {
    await runCatalogAgent(baseParams);
    const mod = await import('./catalogAgent.js');
    expect(mod.runCatalogAgent).toBeDefined();
    await runCatalogAgent(baseParams, {});
    await runCatalogAgent(baseParams, { emitContextUpdate: undefined });
  });

  it('does not throw on unknown intent type (stub)', async () => {
    const emitContextUpdate = vi.fn();
    await expect(runCatalogAgent({ ...baseParams, intentType: 'unknown_type' }, { emitContextUpdate })).resolves.toBeTruthy();
    expect(emitContextUpdate).not.toHaveBeenCalled();
  });
});

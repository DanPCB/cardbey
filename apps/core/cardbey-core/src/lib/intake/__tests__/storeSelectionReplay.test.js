import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as resolveStoreAmbiguity from '../resolveStoreAmbiguity.js';
import {
  buildStoreClarifyOptionsFromHydratedContext,
  matchStoreCandidateByReply,
  tryReplayPendingStoreSelection,
} from '../storeSelectionReplay.js';

describe('storeSelectionReplay', () => {
  beforeEach(() => {
    vi.spyOn(resolveStoreAmbiguity, 'fetchUserStoresForDisambiguation').mockResolvedValue([
      { id: 'store-cafe', name: 'My Cafe', type: 'cafe', logoUrl: null },
      { id: 'store-bakery', name: 'ABC Bakery', type: 'food', logoUrl: null },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('matches store reply by exact name', () => {
    expect(
      matchStoreCandidateByReply('My Cafe', [{ id: 'store-cafe', name: 'My Cafe' }]),
    ).toEqual({ id: 'store-cafe', name: 'My Cafe' });
  });

  it('builds clarify options from hydrated ambiguous store resolution', () => {
    const options = buildStoreClarifyOptionsFromHydratedContext(
      {
        resolution: {
          errors: [
            {
              entityType: 'store',
              reason: 'AMBIGUOUS',
              candidates: [
                { id: 'store-cafe', name: 'My Cafe' },
                { id: 'store-bakery', name: 'ABC Bakery' },
              ],
            },
          ],
        },
      },
      { tool: 'video_generation', parameters: { style: 'promotional' } },
    );

    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({
      label: 'My Cafe',
      tool: 'video_generation',
      parameters: { style: 'promotional', storeId: 'store-cafe' },
    });
  });

  it('replays pending store selection for typed store name', async () => {
    const replay = await tryReplayPendingStoreSelection({
      userMessage: 'My Cafe',
      userId: 'user-1',
      pendingIntent: {
        userMessage: 'Create a short promotional video for my store',
        originalTool: 'video_generation',
        storeCandidates: [{ id: 'store-cafe', name: 'My Cafe' }],
      },
    });

    expect(replay).toEqual({
      selectedTool: 'video_generation',
      selectedParameters: { storeId: 'store-cafe', activeStoreId: 'store-cafe' },
      originalGoal: 'Create a short promotional video for my store',
    });
  });
});

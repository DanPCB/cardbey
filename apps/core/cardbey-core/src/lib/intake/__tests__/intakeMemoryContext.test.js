import { describe, expect, it } from 'vitest';
import {
  attachIntakeMemoryFields,
  normalizeUnifiedMemorySnapshot,
  resolveIntakeDraftId,
  resolveIntakeMissionId,
  resolveIntakeStoreId,
} from '../intakeMemoryContext.js';

describe('intakeMemoryContext', () => {
  it('resolves store id from memorySummary when surface store is unset', () => {
    expect(
      resolveIntakeStoreId({
        memorySummary: { storeId: 'store-from-memory' },
      }),
    ).toBe('store-from-memory');
  });

  it('prefers explicit activeStoreId over memorySummary', () => {
    expect(
      resolveIntakeStoreId({
        activeStoreId: 'store-explicit',
        memorySummary: { storeId: 'store-from-memory' },
      }),
    ).toBe('store-explicit');
  });

  it('resolves draft and mission ids from memorySummary', () => {
    expect(
      resolveIntakeDraftId({
        memorySummary: { draftStoreId: 'draft-1' },
      }),
    ).toBe('draft-1');
    expect(
      resolveIntakeMissionId({
        body: {},
        currentContext: { memorySummary: { missionId: 'mission-9' } },
      }),
    ).toBe('mission-9');
  });

  it('normalizes unified memory snapshot', () => {
    expect(
      normalizeUnifiedMemorySnapshot({
        activeSummary: 'Store needs hero image',
        keyFacts: ['  ', 'Has 12 products'],
        learnedSignals: ['launch_campaign_success'],
        productCount: 12,
        partial: true,
      }),
    ).toEqual({
      activeSummary: 'Store needs hero image',
      keyFacts: ['Has 12 products'],
      learnedSignals: ['launch_campaign_success'],
      productCount: 12,
      partial: true,
    });
  });

  it('attachIntakeMemoryFields backfills active ids from memorySummary', () => {
    const merged = attachIntakeMemoryFields({
      memorySummary: {
        missionId: 'm-1',
        storeId: 's-1',
        draftStoreId: 'd-1',
        missionType: 'launch_campaign',
      },
    });
    expect(merged.activeMissionId).toBe('m-1');
    expect(merged.activeStoreId).toBe('s-1');
    expect(merged.activeDraftId).toBe('d-1');
  });
});

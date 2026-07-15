import { describe, expect, it } from 'vitest';
import {
  buildPerformerStoreSelectionClarify,
  isExplicitGreenfieldCreateStoreIntent,
} from '../accountStoreIntakeGate.js';

describe('isExplicitGreenfieldCreateStoreIntent', () => {
  it('returns true for structured form with store name', () => {
    expect(
      isExplicitGreenfieldCreateStoreIntent({
        storeCreateForm: { storeName: 'ABC Bakery' },
        userMessage: 'continue',
      }),
    ).toBe(true);
  });

  it('returns true for explicit create store message', () => {
    expect(
      isExplicitGreenfieldCreateStoreIntent({
        userMessage: 'Create a new store in Melbourne',
      }),
    ).toBe(true);
  });

  it('returns false for vague help without create wording', () => {
    expect(
      isExplicitGreenfieldCreateStoreIntent({
        userMessage: 'I need help',
        primaryModeHint: 'store_setup',
      }),
    ).toBe(false);
  });

  it('returns false for gibberish with stale store_setup hint', () => {
    expect(
      isExplicitGreenfieldCreateStoreIntent({
        userMessage: 'asdfjkl',
        primaryModeHint: 'store_setup',
      }),
    ).toBe(false);
  });
  it('returns true for Create a store for my business', () => {
    expect(
      isExplicitGreenfieldCreateStoreIntent({
        userMessage: 'Create a store for my business',
      }),
    ).toBe(true);
  });

  it('returns true when freshStoreMission is set', () => {
    expect(
      isExplicitGreenfieldCreateStoreIntent({
        userMessage: 'hello',
        freshStoreMission: true,
      }),
    ).toBe(true);
  });
});

describe('buildPerformerStoreSelectionClarify', () => {
  it('includes store options and create-new option', () => {
    const payload = buildPerformerStoreSelectionClarify({
      stores: [
        { id: 's1', name: 'Pho Chu The', type: 'Food & drink' },
        { id: 's2', name: 'ABC Bakery', type: 'Food & drink' },
      ],
      userMessage: 'I need help',
      lockedTool: 'general_chat',
    });

    expect(payload.action).toBe('clarify');
    expect(payload.clarifyType).toBe('execution_context_store_picker');
    expect(payload.options?.length).toBeGreaterThanOrEqual(3);
    expect(payload.options?.some((o) => o.tool === 'create_store')).toBe(true);
    expect(payload.storeCandidates?.length).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  intentRequiresActiveStoreContext,
  shouldDeferMissionForStoreContext,
  shouldOfferStoreSelectionClarify,
} from '../intakePerformerRouting.js';

describe('intakePerformerRouting', () => {
  it('does not require store context for general chat', () => {
    expect(intentRequiresActiveStoreContext({ intent: 'general_chat', tool: 'general_chat' })).toBe(
      false,
    );
  });

  it('requires store context for campaign and catalog intents', () => {
    expect(intentRequiresActiveStoreContext({ intent: 'create_campaign', tool: 'create_campaign' })).toBe(
      true,
    );
    expect(intentRequiresActiveStoreContext({ intent: 'add_product', tool: 'replace_store_catalog' })).toBe(
      true,
    );
  });

  it('offers store picker only for store-scoped intents without active context', () => {
    const baseState = {
      hasStore: false,
      accountHasStores: true,
      hasActiveStoreContext: false,
      accountStoreCandidates: [{ id: 's1', name: 'Store 1' }],
    };

    expect(
      shouldOfferStoreSelectionClarify({
        intent: 'clarification',
        action: 'ask_clarification',
        userState: baseState,
      }),
    ).toBe(false);

    expect(
      shouldOfferStoreSelectionClarify({
        intent: 'select_store_first',
        action: 'ask_clarification',
        userState: baseState,
      }),
    ).toBe(true);

    expect(
      shouldOfferStoreSelectionClarify({
        intent: 'add_product',
        tool: 'replace_store_catalog',
        action: 'ask_clarification',
        userState: baseState,
      }),
    ).toBe(true);
  });

  it('defers proactive missions only for store-scoped tools without context', () => {
    expect(
      shouldDeferMissionForStoreContext({
        tool: 'general_chat',
        hasActiveStoreContext: false,
        accountHasStores: true,
        accountStoreCount: 3,
      }),
    ).toBe(false);

    expect(
      shouldDeferMissionForStoreContext({
        tool: 'create_campaign',
        hasActiveStoreContext: false,
        accountHasStores: true,
        accountStoreCount: 3,
      }),
    ).toBe(true);

    expect(
      shouldDeferMissionForStoreContext({
        tool: 'create_campaign',
        hasActiveStoreContext: true,
        accountHasStores: true,
        accountStoreCount: 3,
      }),
    ).toBe(false);
  });
});

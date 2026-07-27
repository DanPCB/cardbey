import { describe, expect, it } from 'vitest';
import { matchCreateStoreIntent, normalizeIntentText } from './createStoreIntentContract.js';
import { tryStoreCreateFastPath } from './storeCreateFastPath.js';
import { isExplicitGreenfieldCreateStoreIntent } from '../intake/accountStoreIntakeGate.js';

describe('createStoreIntentContract', () => {
  const phrases = [
    'Create a store',
    'Create my store',
    'Create my first store',
    'Create a new store',
    'Create a business',
    'Start my business',
    'Set up my shop',
    'Build a store for me',
    'I want to create a shop',
    'CREATE MY STORE',
    'Create my store!',
    'Can you create my first store?',
  ];

  it.each(phrases)('matchCreateStoreIntent(%s)', (raw) => {
    const result = matchCreateStoreIntent(raw);
    expect(result.matched).toBe(true);
    expect(result.intent).toBe('create_store');
    expect(result.requiresExistingStore).toBe(false);
  });

  it.each(phrases)('tryStoreCreateFastPath(%s) with activeStoreId', (raw) => {
    const result = tryStoreCreateFastPath(raw, { activeStoreId: 'store-already-selected' });
    expect(result?.tool).toBe('create_store');
    expect(result?.parameters?._autoSubmit).toBe(true);
  });

  it.each(['Create my store', 'Create my first store', 'create a store'])(
    'greenfield gate accepts %s',
    (raw) => {
      expect(isExplicitGreenfieldCreateStoreIntent({ userMessage: raw })).toBe(true);
    },
  );

  it('does not classify promotional video as create_store', () => {
    expect(tryStoreCreateFastPath('create a promotion video for my store', {})).toBeNull();
  });

  it('normalizeIntentText strips punctuation', () => {
    expect(normalizeIntentText('Create my store!')).toBe('create my store');
  });
});

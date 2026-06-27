import { describe, expect, it } from 'vitest';
import {
  resolveCreateStoreHandoffFields,
  shouldForceCreateStoreCheckpointDispatch,
} from '../createStoreCheckpointDispatch.js';

describe('resolveCreateStoreHandoffFields', () => {
  it('prefers storeCreateForm over pill text', () => {
    const fields = resolveCreateStoreHandoffFields({
      storeCreateForm: {
        storeName: 'My Beauty',
        storeType: 'Beauty',
        location: 'Melbourne',
        intentMode: 'store',
      },
      userMessage: 'Other · Other · Sydney',
    });
    expect(fields).toEqual({
      businessName: 'My Beauty',
      businessType: 'Beauty',
      locationTrim: 'Melbourne',
      intentMode: 'store',
    });
  });

  it('parses pill message when form absent', () => {
    const fields = resolveCreateStoreHandoffFields({
      userMessage: 'Melbourne Flower · Other · Melbourne',
    });
    expect(fields.businessName).toBe('Melbourne Flower');
    expect(fields.locationTrim).toBe('Melbourne');
  });
});

describe('shouldForceCreateStoreCheckpointDispatch', () => {
  it('returns true for structured form with _autoSubmit and store name', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: {
          tool: 'create_store',
          parameters: { _autoSubmit: true },
        },
        storeCreateForm: {
          storeName: 'My Cafe',
          storeType: 'Food & drink',
          location: 'Melbourne',
        },
      }),
    ).toBe(true);
  });

  it('returns false without _autoSubmit', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: { tool: 'create_store', parameters: {} },
        storeCreateForm: { storeName: 'My Cafe', location: 'Melbourne' },
      }),
    ).toBe(false);
  });

  it('returns false for add_product even with form envelope', () => {
    expect(
      shouldForceCreateStoreCheckpointDispatch({
        classification: { tool: 'add_product', parameters: { _autoSubmit: true } },
        storeCreateForm: { storeName: 'My Cafe' },
      }),
    ).toBe(false);
  });
});

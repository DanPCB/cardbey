import { describe, expect, it } from 'vitest';
import {
  isStructuredStoreCreatePillMessage,
  matchExactStoreCreatePhrase,
  parseStructuredStoreCreatePillMessage,
  shouldBlockServiceRequestForStoreCreate,
  tryStoreCreateFastPath,
} from '../storeCreateIntentFastPath.js';
import { signalsServiceRequest } from '../../capabilityResolver/resolveCapability.js';

describe('storeCreateIntentFastPath', () => {
  it('matches exact create-a-store phrase', () => {
    const match = matchExactStoreCreatePhrase('Create a store for my business');
    expect(match?.intentMode).toBe('store');
    expect(match?.phrase).toBeTruthy();
  });

  it('fast-path classifies create a store for my business', () => {
    const result = tryStoreCreateFastPath('Create a store for my business', {});
    expect(result?.tool).toBe('create_store');
    expect(result?.executionPath).toBe('direct_action');
    expect(result?.parameters?._autoSubmit).toBe(true);
  });

  it('parses structured pill submit Melbourne Flower · Other · Melbourne', () => {
    const pill = parseStructuredStoreCreatePillMessage('Melbourne Flower · Other · Melbourne');
    expect(pill).toEqual({
      storeName: 'Melbourne Flower',
      category: 'Other',
      location: 'Melbourne',
      intentMode: 'store',
    });
    expect(isStructuredStoreCreatePillMessage('Melbourne Flower · Other · Melbourne')).toBe(true);
  });

  it('fast-path classifies structured pill message as create_store', () => {
    const result = tryStoreCreateFastPath('Melbourne Flower · Other · Melbourne', {});
    expect(result?.tool).toBe('create_store');
    expect(result?.parameters?.storeName).toBe('Melbourne Flower');
    expect(result?.parameters?.storeType).toBe('Other');
    expect(result?.parameters?.location).toBe('Melbourne');
  });

  it('fast-path classifies storeCreateForm envelope', () => {
    const result = tryStoreCreateFastPath('', {
      storeCreateForm: {
        storeName: 'Melbourne Flower',
        storeType: 'Other',
        location: 'Melbourne',
        intentMode: 'store',
      },
    });
    expect(result?.tool).toBe('create_store');
    expect(result?.parameters?.storeName).toBe('Melbourne Flower');
  });

  it('blocks service_request override for store creation phrases', () => {
    expect(
      shouldBlockServiceRequestForStoreCreate('Create a store for my business', {}),
    ).toBe(true);
    expect(
      shouldBlockServiceRequestForStoreCreate('Melbourne Flower · Other · Melbourne', {}),
    ).toBe(true);
    expect(
      shouldBlockServiceRequestForStoreCreate('help me book a haircut in Melbourne', {}),
    ).toBe(false);
  });

  it('signalsServiceRequest stays false for store creation', () => {
    expect(signalsServiceRequest('Create a store for my business')).toBe(false);
    expect(signalsServiceRequest('Melbourne Flower · Other · Melbourne')).toBe(false);
    expect(signalsServiceRequest('help me book a haircut this Sunday')).toBe(true);
  });
});

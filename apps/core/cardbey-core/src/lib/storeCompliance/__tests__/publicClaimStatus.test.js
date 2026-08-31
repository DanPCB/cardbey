import { describe, it, expect } from 'vitest';
import {
  isPublicStoreClaimed,
  isPublicStoreUnclaimed,
  abrVerificationUrl,
} from '../publicClaimStatus.js';

describe('publicClaimStatus', () => {
  it('treats owner stores without claimStatus as claimed', () => {
    expect(isPublicStoreClaimed({ provenance: 'owner', claimStatus: null })).toBe(true);
    expect(isPublicStoreUnclaimed({ provenance: 'owner', claimStatus: null })).toBe(false);
  });

  it('treats unclaimed consumer_capture stores as unclaimed', () => {
    expect(isPublicStoreUnclaimed({ provenance: 'consumer_capture', claimStatus: 'unclaimed' })).toBe(
      true,
    );
    expect(isPublicStoreClaimed({ provenance: 'consumer_capture', claimStatus: 'unclaimed' })).toBe(
      false,
    );
  });

  it('builds ABR verification URLs without spaces', () => {
    expect(abrVerificationUrl('12 345 678 901')).toBe(
      'https://abn.business.gov.au/ABN/View?abn=12345678901',
    );
  });
});

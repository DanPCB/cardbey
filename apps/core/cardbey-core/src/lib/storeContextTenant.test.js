import { describe, expect, it } from 'vitest';
import {
  resolveStoreContextTenantId,
  requireStoreContextTenantId,
  StoreContextTenantError,
} from './storeContextTenant.js';

describe('resolveStoreContextTenantId', () => {
  it('prefers business.userId over auth user', () => {
    expect(
      resolveStoreContextTenantId({
        authUserId: 'user-a',
        business: { userId: 'owner-b' },
      }),
    ).toBe('owner-b');
  });

  it('ignores auth user when it is the literal missing', () => {
    expect(
      resolveStoreContextTenantId({
        authUserId: 'missing',
        business: { userId: 'owner-b' },
      }),
    ).toBe('owner-b');
  });

  it('falls back to auth user when business has no owner', () => {
    expect(resolveStoreContextTenantId({ authUserId: 'user-a', business: null })).toBe('user-a');
  });

  it('returns null when unresolved', () => {
    expect(resolveStoreContextTenantId({ authUserId: null, business: null })).toBeNull();
  });
});

describe('requireStoreContextTenantId', () => {
  it('allows temp store without tenant when flagged', () => {
    expect(requireStoreContextTenantId(null, { storeId: 'temp', allowTempWithoutTenant: true })).toBeNull();
  });

  it('throws for real store without tenant', () => {
    expect(() => requireStoreContextTenantId(null, { storeId: 'store-1' })).toThrow(StoreContextTenantError);
  });
});

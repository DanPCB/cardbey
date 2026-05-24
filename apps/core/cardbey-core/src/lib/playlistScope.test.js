import { describe, expect, it } from 'vitest';
import { isPlausibleTenantId, isValidScopeId } from './playlistScope.js';

describe('playlistScope', () => {
  it('rejects missing and temp tenant ids', () => {
    expect(isValidScopeId('missing')).toBe(false);
    expect(isValidScopeId('temp')).toBe(false);
    expect(isValidScopeId('user_abc')).toBe(true);
  });

  it('rejects tenantId equal to storeId', () => {
    expect(isPlausibleTenantId('store123', 'store123')).toBe(false);
    expect(isPlausibleTenantId('user_abc', 'store123')).toBe(true);
  });
});

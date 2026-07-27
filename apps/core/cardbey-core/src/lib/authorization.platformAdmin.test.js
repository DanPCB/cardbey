import { describe, expect, it } from 'vitest';
import { isPlatformAdmin } from './authorization.js';

describe('isPlatformAdmin', () => {
  it('accepts admin, super_admin, and platform_admin roles', () => {
    expect(isPlatformAdmin({ role: 'admin' })).toBe(true);
    expect(isPlatformAdmin({ role: 'super_admin' })).toBe(true);
    expect(isPlatformAdmin({ role: 'platform_admin' })).toBe(true);
  });

  it('accepts dev-admin synthetic user in non-production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(
      isPlatformAdmin({
        id: 'dev-admin',
        role: 'super_admin',
        isDevAdmin: true,
        isSuperAdmin: true,
      }),
    ).toBe(true);
    process.env.NODE_ENV = prev;
  });

  it('rejects dev-admin flag in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(isPlatformAdmin({ role: 'viewer', isDevAdmin: true })).toBe(false);
    process.env.NODE_ENV = prev;
  });

  it('rejects non-admin business users', () => {
    expect(isPlatformAdmin({ role: 'owner' })).toBe(false);
    expect(isPlatformAdmin({ role: 'staff' })).toBe(false);
  });
});

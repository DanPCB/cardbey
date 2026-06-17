import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TEST_STORE_ALLOWLIST,
  isTestStoreId,
  isTestUserId,
  shouldBypassPermissionValidation,
  isStagingDeploy,
} from '../permissionBypass.js';

describe('permissionBypass', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('includes staging test store in allowlist', () => {
    expect(TEST_STORE_ALLOWLIST.has('cmqi1y4ss002fmzf1piirwrjd')).toBe(true);
  });

  it('detects test store id patterns', () => {
    expect(isTestStoreId('test')).toBe(true);
    expect(isTestStoreId('test-store-123')).toBe(true);
    expect(isTestStoreId('cmqi1y4ss002fmzf1piirwrjd')).toBe(true);
    expect(isTestStoreId('real-store-id')).toBe(false);
  });

  it('detects test user id patterns', () => {
    expect(isTestUserId('test-user')).toBe(true);
    expect(isTestUserId('test-admin-1')).toBe(true);
    expect(isTestUserId('cmqi5ow3z0000jvs896v8vtjb')).toBe(false);
  });

  it('bypasses on staging for test store', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CARDEY_DEPLOY_ENV', 'staging');
    expect(isStagingDeploy()).toBe(true);
    expect(
      shouldBypassPermissionValidation({ userId: 'dev-admin', storeId: 'test' }),
    ).toBe(true);
  });

  it('does not bypass in production for fake store', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CARDEY_DEPLOY_ENV', 'production');
    expect(
      shouldBypassPermissionValidation({ userId: 'dev-admin', storeId: 'test' }),
    ).toBe(false);
  });

  it('bypasses in test env for test user', () => {
    vi.stubEnv('NODE_ENV', 'test');
    expect(
      shouldBypassPermissionValidation({ userId: 'test-user', storeId: 'any-store' }),
    ).toBe(true);
  });
});

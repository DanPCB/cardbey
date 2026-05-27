import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getDbCapabilities,
  resetDbCapabilitiesCache,
  resolveDbProvider,
} from './dbCapabilityRegistry.js';

describe('dbCapabilityRegistry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetDbCapabilitiesCache();
  });

  it('defaults to sqlite when unset', () => {
    vi.stubEnv('DATABASE_PROVIDER', '');
    vi.stubEnv('DATABASE_URL', 'file:./dev.db');
    resetDbCapabilitiesCache();
    expect(resolveDbProvider()).toBe('sqlite');
    const caps = getDbCapabilities();
    expect(caps.supportsCreateManySkipDuplicates).toBe(false);
    expect(caps.supportsExtendedBusinessFields).toBe(false);
    expect(caps.supportsReturning).toBe(false);
  });

  it('enables postgres-only capabilities', () => {
    vi.stubEnv('DATABASE_PROVIDER', 'postgres');
    resetDbCapabilitiesCache();
    const caps = getDbCapabilities();
    expect(caps.provider).toBe('postgres');
    expect(caps.supportsCreateManySkipDuplicates).toBe(true);
    expect(caps.supportsReturning).toBe(true);
    expect(caps.isProductionTarget).toBe(true);
  });
});

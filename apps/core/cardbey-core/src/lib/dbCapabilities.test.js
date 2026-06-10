/**
 * DANH: sqlite-schema-drift-fix
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DB_PROVIDER, dbSupports, extendedBusinessFieldsFromCommerce } from './dbCapabilities.js';

describe('dbCapabilities', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to sqlite and skips extended business fields', () => {
    expect(DB_PROVIDER).toBe('sqlite');
    expect(dbSupports.extendedBusinessFields).toBe(false);
    expect(
      extendedBusinessFieldsFromCommerce({
        transactionMode: 'order',
        catalogLabel: 'Products',
        ctaLabel: 'Order now',
      }),
    ).toEqual({});
  });

  // DANH: sqlite-schema-drift-fix
  it('caseInsensitiveFilter returns mode:insensitive on postgres', async () => {
    vi.stubEnv('DATABASE_PROVIDER', 'postgres');
    vi.resetModules();
    const { caseInsensitiveFilter: filterFn } = await import('./dbCapabilities.js');
    const filter = filterFn('My Store', 'equals');
    expect(filter).toEqual({ equals: 'My Store', mode: 'insensitive' });
  });

  // DANH: sqlite-schema-drift-fix
  it('caseInsensitiveFilter returns contains (no mode) on sqlite', async () => {
    vi.stubEnv('DATABASE_PROVIDER', 'sqlite');
    vi.resetModules();
    const { caseInsensitiveFilter: filterFn } = await import('./dbCapabilities.js');
    const filter = filterFn('My Store', 'equals');
    expect(filter).not.toHaveProperty('mode');
    expect(filter).toHaveProperty('contains', 'My Store');
  });

  it('omits optional columns from public select when missing on sqlite', async () => {
    vi.doMock('./businessColumnCapabilities.js', () => ({
      hasBusinessColumn: (name) => !['heroImageUrl', 'storefrontSettings', 'socialLinks'].includes(name),
    }));
    vi.resetModules();
    const mod = await import('./dbCapabilities.js');
    const select = mod.businessPublicReadSelect();
    expect(select.heroImageUrl).toBeUndefined();
    expect(select.storefrontSettings).toBeUndefined();
    expect(select.socialLinks).toBeUndefined();
    expect(select.id).toBe(true);
    expect(select.name).toBe(true);
    vi.doUnmock('./businessColumnCapabilities.js');
  });

  it('includes optional columns from public select when present on sqlite', async () => {
    vi.doMock('./businessColumnCapabilities.js', () => ({
      hasBusinessColumn: () => true,
    }));
    vi.resetModules();
    const mod = await import('./dbCapabilities.js');
    const select = mod.businessPublicReadSelect();
    expect(select.heroImageUrl).toBe(true);
    expect(select.storefrontSettings).toBe(true);
    expect(select.socialLinks).toBe(true);
    vi.doUnmock('./businessColumnCapabilities.js');
  });

  it('includes extended fields when DATABASE_PROVIDER is postgres', async () => {
    vi.stubEnv('DATABASE_PROVIDER', 'postgres');
    vi.resetModules();
    const mod = await import('./dbCapabilities.js');
    expect(mod.dbSupports.extendedBusinessFields).toBe(true);
    expect(
      mod.extendedBusinessFieldsFromCommerce({
        transactionMode: 'booking',
        catalogLabel: 'Services',
        ctaLabel: 'Book now',
      }),
    ).toEqual({
      transactionMode: 'booking',
      catalogLabel: 'Services',
      ctaLabel: 'Book now',
    });
  });
});

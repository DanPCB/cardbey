import { describe, it, expect } from 'vitest';

describe('storeResearch businessEntityResolver module', () => {
  it('J. imports cleanly and exposes unwrapPlacesSearchRow once', async () => {
    const mod = await import('../businessEntityResolver.js');
    expect(typeof mod.resolveBusinessEntity).toBe('function');
    expect(typeof mod.unwrapPlacesSearchRow).toBe('function');
    expect(typeof mod.isExistingBusinessIntent).toBe('function');

    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../businessEntityResolver.js', import.meta.url), 'utf8'),
    );
    const exportCount = (source.match(/export function unwrapPlacesSearchRow/g) ?? []).length;
    expect(exportCount).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  validateAdapterContract,
  withAdapterDefaults,
  bootstrapProviderAdapters,
  resetProviderAdapterBootstrapForTests,
} from '../providerSdk/index.js';
import { pexelsAdapter } from '../adapters/pexelsAdapter.js';
import { openverseAdapter } from '../adapters/openverseAdapter.js';
import { pixabayAdapter } from '../adapters/pixabayAdapter.js';
import { unsplashAdapter } from '../adapters/unsplashAdapter.js';
import { listAdapters, getAdapter } from '../sourceFederation.js';

describe('Provider SDK contract', () => {
  it('validates complete adapters', () => {
    for (const adapter of [pexelsAdapter, openverseAdapter, pixabayAdapter, unsplashAdapter]) {
      const v = validateAdapterContract(adapter);
      expect(v.ok).toBe(true);
    }
  });

  it('rejects incomplete adapters', () => {
    const v = validateAdapterContract(withAdapterDefaults({ sourceId: 'x' }));
    // withAdapterDefaults fills methods — still needs sourceId which is set
    expect(v.ok).toBe(true);
    expect(validateAdapterContract({}).ok).toBe(false);
  });

  it('bootstraps four Class 1 adapters', () => {
    resetProviderAdapterBootstrapForTests();
    const boot = bootstrapProviderAdapters();
    expect(boot.ok).toBe(true);
    expect(listAdapters()).toEqual(
      expect.arrayContaining(['src_pexels', 'src_openverse', 'src_pixabay', 'src_unsplash']),
    );
    expect(getAdapter('src_pexels')?.search).toBeTypeOf('function');
  });
});

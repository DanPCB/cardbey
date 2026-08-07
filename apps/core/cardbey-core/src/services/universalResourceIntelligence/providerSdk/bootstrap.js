/**
 * Register all Provider SDK adapters into Source Federation.
 */

import { registerProviderAdapter } from './registerAdapter.js';
import { PEXELS_MANIFEST, pexelsAdapter } from '../adapters/pexelsAdapter.js';
import { OPENVERSE_MANIFEST, openverseAdapter } from '../adapters/openverseAdapter.js';
import { PIXABAY_MANIFEST, pixabayAdapter } from '../adapters/pixabayAdapter.js';
import { UNSPLASH_MANIFEST, unsplashAdapter } from '../adapters/unsplashAdapter.js';

let bootstrapped = false;

export function bootstrapProviderAdapters() {
  if (bootstrapped) return { ok: true, already: true };
  registerProviderAdapter(PEXELS_MANIFEST, pexelsAdapter);
  registerProviderAdapter(OPENVERSE_MANIFEST, openverseAdapter);
  registerProviderAdapter(PIXABAY_MANIFEST, pixabayAdapter);
  registerProviderAdapter(UNSPLASH_MANIFEST, unsplashAdapter);
  bootstrapped = true;
  return {
    ok: true,
    adapters: [
      PEXELS_MANIFEST.sourceId,
      OPENVERSE_MANIFEST.sourceId,
      PIXABAY_MANIFEST.sourceId,
      UNSPLASH_MANIFEST.sourceId,
    ],
  };
}

export function resetProviderAdapterBootstrapForTests() {
  bootstrapped = false;
}

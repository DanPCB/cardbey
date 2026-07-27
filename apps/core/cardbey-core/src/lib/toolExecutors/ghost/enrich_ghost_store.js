/**
 * enrich_ghost_store — async enrichment pipeline for ghost stores.
 */

import { enrichGhostStore } from '../../ghostStore/ghostStoreEnrichment.js';

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const storeId = typeof input.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return {
      status: 'failed',
      error: { message: 'storeId is required' },
      output: { ok: false },
    };
  }

  await enrichGhostStore({
    storeId,
    extraction: input.extraction ?? {},
    location: input.location ?? null,
    heroImageUrl: input.heroImageUrl ?? null,
    capturedImagePaths: input.imagePaths ?? [],
  });

  return { status: 'ok', output: { ok: true, storeId } };
}

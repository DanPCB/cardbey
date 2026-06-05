/**
 * search_hero_media — Search hero videos across configured media providers.
 */

import VideoSearchService from '../../../services/media/VideoSearchService.js';

const ALLOWED_MEDIA_TYPES = new Set(['video', 'photo', 'logo', 'background']);

/**
 * @param {object} [input]
 * @param {string} [input.query]
 * @param {string} [input.mediaType]
 * @param {string} [input.storeId]
 * @param {number} [input.perPage]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const query = String(input?.query ?? '').trim();
    if (!query) {
      return {
        status: 'failed',
        error: { code: 'QUERY_REQUIRED', message: 'query is required' },
        output: { ok: false, error: 'query is required' },
      };
    }

    const perPageRaw = Number(input?.perPage);
    const perPage =
      Number.isFinite(perPageRaw) && perPageRaw > 0 ? Math.min(Math.floor(perPageRaw), 50) : 12;

    const mediaTypeRaw = String(input?.mediaType ?? 'video').trim().toLowerCase() || 'video';
    const mediaType = ALLOWED_MEDIA_TYPES.has(mediaTypeRaw) ? mediaTypeRaw : 'video';

    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const searchResult = await VideoSearchService.searchAllSources(query, { perPage });
    const results = Array.isArray(searchResult?.results) ? searchResult.results : [];

    return {
      status: 'ok',
      output: {
        ok: true,
        query,
        mediaType,
        storeId,
        count: results.length,
        results,
        bySource: searchResult?.bySource ?? {},
        skipped: searchResult?.skipped ?? [],
        errors: searchResult?.errors ?? {},
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'SEARCH_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;

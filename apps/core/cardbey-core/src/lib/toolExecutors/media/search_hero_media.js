/**
 * search_hero_media — Search hero videos across configured media providers.
 */

import VideoSearchService from '../../../services/media/VideoSearchService.js';
import { executeContentTool } from '../executeContentTool.js';

const ALLOWED_MEDIA_TYPES = new Set(['video', 'photo', 'logo', 'background']);

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const query = String(input?.query ?? '').trim();
  if (!query) {
    return {
      status: 'failed',
      error: { code: 'QUERY_REQUIRED', message: 'query is required' },
      output: { ok: false, error: 'query is required' },
    };
  }

  return await executeContentTool({
    toolName: 'search_hero_media',
    input,
    context,
    processor: async (inp, ctx) => {
      const perPageRaw = Number(inp?.perPage);
      const perPage =
        Number.isFinite(perPageRaw) && perPageRaw > 0 ? Math.min(Math.floor(perPageRaw), 50) : 12;

      const mediaTypeRaw = String(inp?.mediaType ?? 'video').trim().toLowerCase() || 'video';
      const mediaType = ALLOWED_MEDIA_TYPES.has(mediaTypeRaw) ? mediaTypeRaw : 'video';

      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const searchResult = await VideoSearchService.searchAllSources(query, { perPage });
      const results = Array.isArray(searchResult?.results) ? searchResult.results : [];

      return {
        query,
        mediaType,
        storeId,
        count: results.length,
        results,
        bySource: searchResult?.bySource ?? {},
        skipped: searchResult?.skipped ?? [],
        errors: searchResult?.errors ?? {},
      };
    },
    isEmpty: (result) => {
      const results = Array.isArray(result?.results) ? result.results : [];
      return results.length === 0 || !results.some((r) => r?.url || r?.previewUrl);
    },
    countRecords: (result) => (Array.isArray(result?.results) ? result.results.length : 0),
  });
}

export default execute;

/**
 * generate_campaign_graphics — Find stock media matched to a campaign brief.
 */

import VideoSearchService from '../../../services/media/VideoSearchService.js';
import { executeContentTool } from '../executeContentTool.js';

const ALLOWED_MEDIA_TYPES = new Set(['video', 'photo', 'logo', 'background']);

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeContentTool({
    toolName: 'generate_campaign_graphics',
    input,
    context,
    processor: async (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const brief = inp?.brief && typeof inp.brief === 'object' ? inp.brief : {};
      const query =
        String(brief?.objective ?? inp?.style ?? '').trim() || 'promotion campaign';

      const mediaTypeRaw = String(inp?.mediaType ?? 'photo').trim().toLowerCase() || 'photo';
      const mediaType = ALLOWED_MEDIA_TYPES.has(mediaTypeRaw) ? mediaTypeRaw : 'photo';

      const searchResult = await VideoSearchService.searchAllSources(query, { perPage: 8 });
      const results = Array.isArray(searchResult?.results) ? searchResult.results : [];

      const graphics = results.map((item, index) => ({
        id: item?.id ?? `graphic-${index + 1}`,
        type: mediaType,
        url: item?.url ?? item?.previewUrl ?? null,
        source: item?.source ?? null,
        query,
        storeId,
      }));

      return { storeId, query, mediaType, count: graphics.length, graphics };
    },
    isEmpty: (result) => {
      const graphics = Array.isArray(result?.graphics) ? result.graphics : [];
      return graphics.length === 0 || !graphics.some((g) => g?.url);
    },
    countRecords: (result) => (Array.isArray(result?.graphics) ? result.graphics.length : 0),
  });
}

export default execute;

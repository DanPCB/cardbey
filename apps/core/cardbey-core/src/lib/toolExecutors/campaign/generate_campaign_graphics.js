/**
 * generate_campaign_graphics — Find stock media matched to a campaign brief.
 */

import VideoSearchService from '../../../services/media/VideoSearchService.js';

const ALLOWED_MEDIA_TYPES = new Set(['video', 'photo', 'logo', 'background']);

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {object} [input.brief]
 * @param {string} [input.style]
 * @param {string} [input.mediaType]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const brief = input?.brief && typeof input.brief === 'object' ? input.brief : {};
    const query =
      String(brief?.objective ?? input?.style ?? '').trim() || 'promotion campaign';

    const mediaTypeRaw = String(input?.mediaType ?? 'photo').trim().toLowerCase() || 'photo';
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

    return {
      status: 'ok',
      output: {
        ok: true,
        storeId,
        query,
        mediaType,
        count: graphics.length,
        graphics,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'GRAPHICS_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;

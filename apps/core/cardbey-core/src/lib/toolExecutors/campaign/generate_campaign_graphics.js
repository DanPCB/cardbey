/**
 * generate_campaign_graphics — Find stock media matched to a campaign brief.
 */

import VideoSearchService from '../../../services/media/VideoSearchService.js';
import { getStoreContext } from '../../../services/storeContext.js';
import { executeContentTool } from '../executeContentTool.js';

const ALLOWED_MEDIA_TYPES = new Set(['video', 'photo', 'logo', 'background']);

/**
 * Resolve a usable media URL from VideoSearchService / legacy result shapes.
 * For photo/background assets, prefer still-image URLs (thumbnail) over video files.
 *
 * @param {Record<string, unknown>} item
 * @param {{ mediaType?: string }} [options]
 * @returns {string | null}
 */
export function resolveMediaResultUrl(item, options = {}) {
  if (!item || typeof item !== 'object') return null;
  const mediaType = String(options.mediaType ?? 'photo').trim().toLowerCase();
  const preferStillImage =
    mediaType === 'photo' || mediaType === 'background' || mediaType === 'logo';

  const stillImageCandidates = [
    item.thumbnail_url,
    item.thumbnailUrl,
    item.url,
    item.preview_url,
    item.previewUrl,
    item.video_url,
  ];
  const videoCandidates = [
    item.video_url,
    item.url,
    item.preview_url,
    item.previewUrl,
    item.thumbnail_url,
    item.thumbnailUrl,
  ];
  const candidates = preferStillImage ? stillImageCandidates : videoCandidates;

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Build a stock-media search query from brief + optional store context.
 * @param {Record<string, unknown>} brief
 * @param {string} fallbackGoal
 * @param {{ name?: string; type?: string } | null} [store]
 */
export function buildCampaignMediaSearchQuery(brief, fallbackGoal = '', store = null) {
  const offer = typeof brief?.offer === 'string' ? brief.offer.trim() : '';
  const audience = typeof brief?.targetAudience === 'string' ? brief.targetAudience.trim() : '';
  const objective = typeof brief?.objective === 'string' ? brief.objective.trim() : '';

  const objectiveTerms = objective
    .replace(/^(create|make|build|run|launch)\s+(a|an)\s+/i, '')
    .replace(/\s+campaign\s+for\s+my\s+store\.?$/i, '')
    .replace(/\s+for\s+my\s+store\.?$/i, '')
    .replace(/\s+campaign\.?$/i, '')
    .trim();

  const storeName = typeof store?.name === 'string' ? store.name.trim() : '';
  const businessType = typeof store?.type === 'string' ? store.type.trim() : '';

  const parts = [offer, objectiveTerms, businessType, storeName, audience, fallbackGoal]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);

  const unique = [...new Set(parts)];
  const query = unique.join(' ').trim();
  return query || 'local business promotion';
}


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
      const goal =
        (typeof ctx?.goal === 'string' && ctx.goal.trim()) ||
        (typeof inp?.objective === 'string' && inp.objective.trim()) ||
        '';

      let store = null;
      if (storeId) {
        try {
          store = await getStoreContext(storeId);
        } catch {
          store = null;
        }
      }

      const query = buildCampaignMediaSearchQuery(brief, goal, store);

      const mediaTypeRaw = String(inp?.mediaType ?? 'photo').trim().toLowerCase() || 'photo';
      const mediaType = ALLOWED_MEDIA_TYPES.has(mediaTypeRaw) ? mediaTypeRaw : 'photo';

      const searchResult = await VideoSearchService.searchAllSources(query, { perPage: 8 });
      const results = Array.isArray(searchResult?.results) ? searchResult.results : [];

      const graphics = results
        .map((item, index) => {
          const url = resolveMediaResultUrl(item, { mediaType });
          const thumbnailUrl =
            (typeof item?.thumbnail_url === 'string' && item.thumbnail_url.trim()) ||
            (typeof item?.thumbnailUrl === 'string' && item.thumbnailUrl.trim()) ||
            (typeof url === 'string' && url.trim() && !url.includes('.mp4') ? url.trim() : null);
          return {
            id: item?.id ?? `graphic-${index + 1}`,
            type: mediaType,
            url: thumbnailUrl || url,
            thumbnailUrl: thumbnailUrl || url,
            source: item?.source ?? null,
            query,
            storeId,
          };
        })
        .filter((g) => Boolean(g.url));

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

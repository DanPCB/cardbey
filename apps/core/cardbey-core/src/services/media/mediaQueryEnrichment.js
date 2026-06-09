/**
 * Tool-dispatcher media query enrichment helpers.
 */

import { buildMediaSearchQuery } from './buildMediaSearchQuery.js';
import { resolveStoreContext } from './storeContextResolver.js';

/** Tools that always receive query enrichment when dispatched. */
export const MEDIA_ENRICHMENT_TOOL_NAMES = new Set([
  'search_hero_media',
  'generate_store_images',
  'search_store_videos',
]);

/**
 * @param {string} toolName
 */
export function deriveMediaType(toolName) {
  const n = String(toolName ?? '').toLowerCase();
  if (n.includes('video')) return 'video';
  if (n.includes('logo')) return 'logo';
  if (n.includes('background')) return 'background';
  if (n.includes('photo') || n.includes('image')) return 'photo';
  return 'photo';
}

/**
 * @param {string} toolName
 * @param {object} input
 */
export function shouldEnrichMediaQuery(toolName, input = {}) {
  const name = String(toolName ?? '').trim();
  if (!name) return false;
  if (MEDIA_ENRICHMENT_TOOL_NAMES.has(name)) return true;

  const n = name.toLowerCase();
  if (/search_(hero_media|store_video|store_videos)|generate_store_images/.test(n)) {
    return true;
  }
  if (n.includes('media') && (n.includes('search') || n.includes('hero'))) {
    return true;
  }

  const hasQueryField =
    (typeof input.query === 'string' && input.query.trim()) ||
    (typeof input.q === 'string' && input.q.trim()) ||
    (typeof input.prompt === 'string' && input.prompt.trim()) ||
    typeof input.mediaType === 'string';

  if (!hasQueryField) return false;

  return (
    n.includes('video') ||
    n.includes('logo') ||
    n.includes('background') ||
    n.includes('photo') ||
    n.includes('image') ||
    n.includes('hero_media') ||
    n.includes('store_images')
  );
}

/**
 * @param {string} toolName
 * @param {object} input
 * @param {object} context
 */
export async function enrichMediaSearchInput(toolName, input = {}, context = {}) {
  if (!shouldEnrichMediaQuery(toolName, input)) {
    return input;
  }

  const missionId =
    (typeof context.missionId === 'string' && context.missionId.trim()) ||
    (typeof context.activeMissionId === 'string' && context.activeMissionId.trim()) ||
    null;
  const storeId =
    (typeof context.storeId === 'string' && context.storeId.trim()) ||
    (typeof input.storeId === 'string' && input.storeId.trim()) ||
    null;

  const storeContext = await resolveStoreContext(missionId, storeId);
  const originalQuery = String(
    input.query ?? input.q ?? input.prompt ?? '',
  ).trim();
  const mediaType =
    (typeof input.mediaType === 'string' && input.mediaType.trim().toLowerCase()) ||
    deriveMediaType(toolName);

  const enrichedQuery = buildMediaSearchQuery({
    userIntent: originalQuery,
    mediaType,
    storeContext,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[MediaQueryEnrichment] "${originalQuery}" → "${enrichedQuery}" (${mediaType}, ${storeContext.industry || 'n/a'})`,
    );
  }

  const out = { ...input, mediaType };
  if ('query' in input || MEDIA_ENRICHMENT_TOOL_NAMES.has(toolName)) {
    out.query = enrichedQuery;
  }
  if ('q' in input) {
    out.q = enrichedQuery;
  }
  if ('prompt' in input && !('query' in input) && !('q' in input)) {
    out.prompt = enrichedQuery;
  }
  if (!('query' in out) && !('q' in out) && !('prompt' in out)) {
    out.query = enrichedQuery;
  }
  return out;
}

export default {
  deriveMediaType,
  shouldEnrichMediaQuery,
  enrichMediaSearchInput,
  MEDIA_ENRICHMENT_TOOL_NAMES,
};

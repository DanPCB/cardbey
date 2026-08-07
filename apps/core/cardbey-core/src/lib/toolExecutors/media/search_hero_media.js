/**
 * search_hero_media — Path C cutover: discover via URI Federation only.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { searchResourcesForConsumer } from '../../../services/universalResourceIntelligence/consumers.js';
import { executeContentTool } from '../executeContentTool.js';

const ALLOWED_MEDIA_TYPES = new Set(['video', 'photo', 'logo', 'background', 'image']);

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
      const mediaType = ALLOWED_MEDIA_TYPES.has(mediaTypeRaw)
        ? mediaTypeRaw === 'photo'
          ? 'image'
          : mediaTypeRaw
        : 'video';

      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const db = typeof getPrismaClient === 'function' ? await getPrismaClient() : null;
      const uri = await searchResourcesForConsumer(db, {
        query,
        utterance: query,
        consumer: 'tool:search_hero_media',
        mediaType: mediaType === 'logo' || mediaType === 'background' ? 'image' : mediaType,
        channel: 'website',
        purpose: 'hero_media',
      });

      const candidates = Array.isArray(uri?.candidates) ? uri.candidates : [];
      const results = candidates.slice(0, perPage).map((c) => {
        const r = c.resource || {};
        return {
          id: r.id,
          url: r.technical?.downloadUrl || r.canonicalUrl || r.previewUrl,
          previewUrl: r.previewUrl,
          provider: r.sourceId,
          sourceId: r.sourceId,
          mediaType: r.mediaType,
          title: r.title,
          attribution: r.sourceMetadata?.attributionText || c.explanation?.attribution,
          custodyMode: c.explanation?.custodyMode || r.technical?.custodyMode,
          rightsDecision: c.rights?.decision,
          via: 'uri_federation',
        };
      });

      const bySource = {};
      for (const r of results) {
        const k = r.sourceId || 'unknown';
        bySource[k] = (bySource[k] || 0) + 1;
      }

      return {
        query,
        mediaType,
        storeId,
        count: results.length,
        results,
        bySource,
        skipped: uri?.discoveryMeta?.skipped || uri?.searchPlan?.federation?.skipped || [],
        federation: uri?.searchPlan?.federation || null,
        errors: uri?.ok === false ? { uri: uri.error } : {},
        authority: 'universal_resource_intelligence',
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

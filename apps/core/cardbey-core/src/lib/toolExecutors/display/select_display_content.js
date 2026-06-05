/**
 * select_display_content — Resolve content for in-store display (Phase 3: placeholder lookup).
 */

import { randomUUID } from 'node:crypto';

const ALLOWED_CONTENT_TYPES = new Set(['campaign', 'hero', 'slideshow', 'product']);

const DEFAULT_TITLES = {
  campaign: 'Campaign display',
  hero: 'Store hero',
  slideshow: 'Product slideshow',
  product: 'Featured product',
};

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {string} [input.contentType]
 * @param {string|null} [input.artifactId]
 * @param {string|null} [input.campaignId]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  try {
    const storeId =
      (typeof input?.storeId === 'string' && input.storeId.trim()) ||
      (typeof context?.storeId === 'string' && context.storeId.trim()) ||
      null;

    const contentTypeRaw = String(input?.contentType ?? 'campaign').trim().toLowerCase() || 'campaign';
    const contentType = ALLOWED_CONTENT_TYPES.has(contentTypeRaw) ? contentTypeRaw : 'campaign';

    const artifactId =
      typeof input?.artifactId === 'string' && input.artifactId.trim()
        ? input.artifactId.trim()
        : null;
    const campaignId =
      typeof input?.campaignId === 'string' && input.campaignId.trim()
        ? input.campaignId.trim()
        : null;

    const id = artifactId || campaignId || randomUUID();
    const title = DEFAULT_TITLES[contentType] || 'Display content';

    const content = {
      id,
      type: contentType,
      title,
      storeId,
      artifactId,
      campaignId,
      assets: [
        {
          id: `${id}-asset-1`,
          type: contentType === 'slideshow' ? 'video' : 'image',
          url: null,
          placeholder: true,
        },
      ],
      duration: contentType === 'slideshow' ? 60000 : 30000,
      aspectRatio: contentType === 'hero' ? '16:9' : '16:9',
    };

    return {
      status: 'ok',
      output: {
        ok: true,
        content,
      },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      status: 'failed',
      error: { code: 'SELECT_CONTENT_FAILED', message },
      output: { ok: false, error: message },
    };
  }
}

export default execute;

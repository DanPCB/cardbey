/**
 * select_display_content — Resolve content for in-store display (placeholder lookup until wired).
 */

import { randomUUID } from 'node:crypto';
import { executeContentTool } from '../executeContentTool.js';

const ALLOWED_CONTENT_TYPES = new Set(['campaign', 'hero', 'slideshow', 'product']);

const DEFAULT_TITLES = {
  campaign: 'Campaign display',
  hero: 'Store hero',
  slideshow: 'Product slideshow',
  product: 'Featured product',
};

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeContentTool({
    toolName: 'select_display_content',
    input,
    context,
    processor: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const contentTypeRaw = String(inp?.contentType ?? 'campaign').trim().toLowerCase() || 'campaign';
      const contentType = ALLOWED_CONTENT_TYPES.has(contentTypeRaw) ? contentTypeRaw : 'campaign';

      const artifactId =
        typeof inp?.artifactId === 'string' && inp.artifactId.trim() ? inp.artifactId.trim() : null;
      const campaignId =
        typeof inp?.campaignId === 'string' && inp.campaignId.trim() ? inp.campaignId.trim() : null;

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
        aspectRatio: '16:9',
      };

      return { content };
    },
    validateResult: (result) => {
      const assets = Array.isArray(result?.content?.assets) ? result.content.assets : [];
      const hasRealAsset = assets.some((a) => a?.url && !a?.placeholder);
      if (!hasRealAsset) {
        return {
          blocked: true,
          reason: 'placeholder_content',
          message: 'Display content selection returned placeholder assets only — no real media URL',
        };
      }
      return null;
    },
    isEmpty: (result) => !result?.content,
  });
}

export default execute;

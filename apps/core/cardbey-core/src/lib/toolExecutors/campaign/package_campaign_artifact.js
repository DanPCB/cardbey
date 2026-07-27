/**
 * package_campaign_artifact — Bundle brief, graphics, and copy into a publishable artifact.
 */

import { randomUUID } from 'node:crypto';
import { normalizeCampaignPackageArtifact } from '../../mission/campaignPackageArtifact.js';
import { executeContentTool } from '../executeContentTool.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeContentTool({
    toolName: 'package_campaign_artifact',
    input,
    context,
    processor: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const brief = inp?.brief && typeof inp.brief === 'object' ? inp.brief : null;
      const graphics = Array.isArray(inp?.graphics) ? inp.graphics : [];
      const copy = inp?.copy && typeof inp.copy === 'object' ? inp.copy : null;
      const slideshowId =
        typeof inp?.slideshowId === 'string' && inp.slideshowId.trim()
          ? inp.slideshowId.trim()
          : null;
      const slideshowUrl =
        typeof inp?.slideshowUrl === 'string' && inp.slideshowUrl.trim()
          ? inp.slideshowUrl.trim()
          : null;
      const poster = inp?.poster && typeof inp.poster === 'object' ? inp.poster : null;

      const artifact = normalizeCampaignPackageArtifact({
        id: randomUUID(),
        storeId,
        brief,
        graphics,
        copy,
        ...(poster ? { poster } : {}),
        slideshowId,
        ...(slideshowUrl ? { slideshowUrl } : {}),
        status: 'ready',
        createdAt: new Date().toISOString(),
      });

      return { artifact };
    },
    validateResult: (result) => {
      const artifact = result?.artifact;
      const briefOk = artifact?.brief && String(artifact.brief.objective ?? '').trim();
      const copyOk = artifact?.copy && String(artifact.copy.headline ?? '').trim();
      const graphicsOk =
        Array.isArray(artifact?.graphics) &&
        artifact.graphics.length > 0 &&
        artifact.graphics.some((g) => g?.url);

      if (!briefOk || !copyOk || !graphicsOk) {
        return {
          blocked: true,
          reason: 'incomplete_package',
          message: 'Campaign package requires brief, copy with headline, and at least one graphic with a URL',
        };
      }
      return null;
    },
    isEmpty: (result) => !result?.artifact,
    countRecords: () => 1,
  });
}

export default execute;

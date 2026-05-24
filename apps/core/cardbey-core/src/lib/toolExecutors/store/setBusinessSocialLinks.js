/**
 * setBusinessSocialLinks — Performer tool: merge-validated social URLs onto Business.socialLinks.
 */

import { getPrismaClient } from '../../prisma.js';
import {
  collectValidSocialLinksPartial,
  mergeSocialLinksRecords,
} from '../../socialLinks.js';
import { setBlackboardKey } from '../../missionBlackboard.js';
import { buildPersistAndApplyPublishedProjection } from '../../../services/publishedArtifactProjection/publishProjectionHooks.js';

/**
 * @param {object} [input]
 * @param {string} [input.storeId]
 * @param {Record<string, string>} [input.socialLinks]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  if (!storeId) {
    return {
      status: 'failed',
      error: { code: 'STORE_ID_REQUIRED', message: 'storeId is required' },
    };
  }

  const { written, skipped, keysWritten } = collectValidSocialLinksPartial(input?.socialLinks);
  if (!keysWritten.length) {
    return {
      status: 'ok',
      output: {
        noop: true,
        storeId,
        skipped,
        message: 'No valid social links to set.',
      },
    };
  }

  const prisma = getPrismaClient();
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      userId: true,
      socialLinks: true,
      publishedAt: true,
      isActive: true,
    },
  });

  if (!business) {
    return {
      status: 'failed',
      error: { code: 'STORE_NOT_FOUND', message: 'Store not found' },
    };
  }

  const merged = mergeSocialLinksRecords(business.socialLinks, written);
  await prisma.business.update({
    where: { id: storeId },
    data: { socialLinks: merged },
  });

  console.log('[SOCIAL_LINKS_DIRECT_WRITE]', {
    storeId,
    userId: context?.userId ?? context?.req?.user?.id ?? null,
    networks: keysWritten,
    source: 'performer_tool',
    timestamp: new Date().toISOString(),
  });

  let projectionRebuilt = false;
  if (business.publishedAt != null && business.isActive === true) {
    try {
      await buildPersistAndApplyPublishedProjection(prisma, {
        businessId: storeId,
        tenantId: business.userId,
        source: 'setBusinessSocialLinks',
      });
      projectionRebuilt = true;
    } catch (err) {
      console.warn('[setBusinessSocialLinks] projection rebuild failed (non-fatal):', err?.message || err);
    }
  }

  const missionId =
    (typeof context?.missionId === 'string' && context.missionId.trim()) ||
    (typeof context?.activeMissionId === 'string' && context.activeMissionId.trim()) ||
    (typeof context?.mission?.id === 'string' && context.mission.id.trim()) ||
    null;

  if (missionId) {
    await setBlackboardKey(missionId, 'business.socialLinks', {
      networks: keysWritten,
      socialLinks: merged,
      updatedAt: new Date().toISOString(),
    }, {
      agentId: typeof context?.agentId === 'string' ? context.agentId : 'performer',
    }).catch(() => {});
  }

  return {
    status: 'ok',
    output: {
      storeId,
      networks: keysWritten,
      socialLinks: merged,
      skipped,
      projectionRebuilt,
    },
  };
}

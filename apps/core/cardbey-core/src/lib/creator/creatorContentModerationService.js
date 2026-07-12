/**
 * Platform admin moderation for creator content awaiting review.
 * @deprecated Use creatorPublishingService — kept for backwards-compatible API aliases.
 */

import { getPrismaClient } from '../prisma.js';
import {
  approveCreatorPublishing,
  listCreatorPublishingQueue,
  publishCreatorPublishingContent,
  rejectCreatorPublishing,
} from './publishing/creatorPublishingService.js';
import { CREATOR_PUBLISHING_STATUS } from './publishing/creatorPublishingTypes.js';
import { logCreatorContentTelemetry } from './creatorContentTelemetry.js';
import { CREATOR_CONTENT_STATUS, toPublicCreatorContent } from './creatorTypes.js';
/**
 * @param {{ limit?: number }} opts
 */
export async function listCreatorContentPendingModeration(opts = {}) {
  return listCreatorPublishingQueue({
    queue: 'human_review_required',
    limit: opts.limit ?? 50,
  });
}

/**
 * @returns {Promise<number>}
 */
export async function countCreatorContentPendingModeration() {
  const prisma = getPrismaClient();
  return prisma.creatorContent.count({
    where: {
      status: {
        in: [
          CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED,
          CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH,
          CREATOR_CONTENT_STATUS.OWNER_REVIEW,
        ],
      },
    },
  });
}

/**
 * @param {string} contentId
 * @param {object} context
 */
export async function approveCreatorContentModeration(contentId, context = {}) {
  logCreatorContentTelemetry('creator_content_admin_approve_started', {
    contentId,
    adminUserId: context.adminUserId ?? null,
    source: 'creator_publishing_center',
  });

  const result = await approveCreatorPublishing(contentId, { publishNow: true }, {
    reviewerUserId: context.adminUserId ?? null,
    actorType: 'admin',
  });

  logCreatorContentTelemetry('creator_content_admin_approved', {
    contentId,
    adminUserId: context.adminUserId ?? null,
    creatorId: result.content?.creatorId,
    contentType: result.content?.type,
  });

  return result;
}

/**
 * @param {string} contentId
 * @param {string} [reason]
 * @param {object} context
 */
export async function rejectCreatorContentModeration(contentId, reason = '', context = {}) {
  const content = await rejectCreatorPublishing(contentId, {
    creatorFeedback: reason,
    reasonCode: 'POLICY_CONCERN',
  }, {
    reviewerUserId: context.adminUserId ?? null,
  });

  logCreatorContentTelemetry('creator_content_admin_rejected', {
    contentId: content.contentId,
    creatorId: content.creatorId,
    adminUserId: context.adminUserId ?? null,
    contentType: content.type,
    reason: reason || null,
  });

  return content;
}

export default {
  listCreatorContentPendingModeration,
  countCreatorContentPendingModeration,
  approveCreatorContentModeration,
  rejectCreatorContentModeration,
};

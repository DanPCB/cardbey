/**
 * Creator Publishing Center — state transitions, queue, decisions, publish.
 */

import { getPrismaClient } from '../../prisma.js';
import { publishCreatorContentRecord } from '../creatorContentService.js';
import { toPublicCreatorContent } from '../creatorTypes.js';
import {
  createCreatorContentError,
  createCreatorContentTransitionError,
} from '../creatorContentErrors.js';
import { appendPublishingEvent } from './creatorPublishingEventService.js';
import {
  canTransitionPublishingStatus,
  CREATOR_PUBLISHING_STATUS,
  DEFAULT_PUBLISHING_DESTINATIONS,
  normalizePublishingStatus,
  QUEUE_STATUS_MAP,
} from './creatorPublishingTypes.js';

/**
 * @param {string} contentId
 * @param {string} toStatus
 * @param {object} [context]
 */
export async function transitionPublishingStatus(contentId, toStatus, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');

  const fromStatus = normalizePublishingStatus(existing.status);
  const target = normalizePublishingStatus(toStatus);

  if (fromStatus === target) {
    return toPublicCreatorContent(existing);
  }

  if (!canTransitionPublishingStatus(fromStatus, target)) {
    throw createCreatorContentTransitionError(fromStatus, target, 'Invalid publishing status transition.');
  }

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: { status: target },
  });

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_publishing_status_changed',
    fromStatus,
    toStatus: target,
    actorType: context.actorType ?? 'system',
    actorId: context.actorId ?? null,
    metadata: context.metadata ?? null,
  });

  return toPublicCreatorContent(row);
}

/**
 * @param {object} opts
 */
export async function listCreatorPublishingQueue(opts = {}) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
  const queue = opts.queue || 'human_review_required';
  const statuses = QUEUE_STATUS_MAP[queue] || [CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED];

  const where = { status: { in: statuses } };
  if (opts.type) where.type = String(opts.type).toUpperCase();
  if (opts.q) {
    const q = String(opts.q).trim();
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
      { creator: { username: { contains: q } } },
      { creator: { displayName: { contains: q } } },
    ];
  }

  const orderBy =
    opts.sort === 'newest' ? { updatedAt: 'desc' } : { updatedAt: 'asc' };

  const rows = await prisma.creatorContent.findMany({
    where,
    orderBy,
    take: limit,
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          userId: true,
          totalPublishedMinutes: true,
          totalVideos: true,
          totalArticles: true,
          followers: true,
          isQualified: true,
          joinedAt: true,
          categories: true,
          country: true,
        },
      },
      classifications: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  return rows.map((row) => formatQueueItem(row));
}

function formatQueueItem(row) {
  const latest = row.classifications?.[0] ?? null;
  const result = latest?.resultJson && typeof latest.resultJson === 'object' ? latest.resultJson : null;
  return {
    ...toPublicCreatorContent(row),
    creator: row.creator
      ? {
          creatorId: row.creator.id,
          username: row.creator.username,
          displayName: row.creator.displayName,
          avatar: row.creator.avatar,
          userId: row.creator.userId,
          totalPublishedMinutes: row.creator.totalPublishedMinutes,
          totalVideos: row.creator.totalVideos,
          totalArticles: row.creator.totalArticles,
          followers: row.creator.followers,
          isQualified: row.creator.isQualified,
          joinedAt: row.creator.joinedAt,
          categories: row.creator.categories,
          country: row.creator.country,
        }
      : null,
    classification: latest
      ? {
          classificationId: latest.id,
          recommendation: latest.recommendation,
          confidence: latest.confidence,
          overallRisk: result?.risk?.overall ?? null,
          primaryCategory: result?.primaryCategory ?? null,
          summary: result?.summary ?? null,
          createdAt: latest.createdAt,
        }
      : null,
    publishingDestinations: row.publishingDestinations ?? null,
    creatorFeedback: row.creatorFeedback ?? null,
    scheduledAt: row.scheduledAt ?? null,
  };
}

/**
 * @returns {Promise<Record<string, number>>}
 */
export async function getCreatorPublishingStats() {
  const prisma = getPrismaClient();
  const counts = await prisma.creatorContent.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const map = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const publishedToday = await prisma.creatorContent.count({
    where: { status: CREATOR_PUBLISHING_STATUS.PUBLISHED, publishedAt: { gte: today } },
  });
  return {
    pendingClassification:
      (map[CREATOR_PUBLISHING_STATUS.OWNER_REVIEW] ?? 0) +
      (map[CREATOR_PUBLISHING_STATUS.CLASSIFICATION_PENDING] ?? 0),
    humanReviewRequired: map[CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED] ?? 0,
    readyToPublish: map[CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH] ?? 0,
    scheduled: map[CREATOR_PUBLISHING_STATUS.SCHEDULED] ?? 0,
    publishedToday,
    changesRequested: map[CREATOR_PUBLISHING_STATUS.CHANGES_REQUESTED] ?? 0,
    rejectedToday: 0,
    escalated: map[CREATOR_PUBLISHING_STATUS.ESCALATED] ?? 0,
    aiReviewed: map[CREATOR_PUBLISHING_STATUS.AI_REVIEWED] ?? 0,
  };
}

/**
 * @param {string} contentId
 */
export async function getCreatorPublishingDetail(contentId) {
  const prisma = getPrismaClient();
  const row = await prisma.creatorContent.findUnique({
    where: { id: contentId },
    include: {
      creator: true,
      classifications: { orderBy: { createdAt: 'desc' }, take: 5 },
      decisions: { orderBy: { createdAt: 'desc' }, take: 10 },
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!row) return null;
  return {
    content: formatQueueItem(row),
    creator: row.creator,
    classifications: row.classifications,
    decisions: row.decisions,
    events: row.events,
  };
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function recordPublishingDecision(contentId, input, context = {}) {
  const prisma = getPrismaClient();
  const latest = await prisma.creatorClassification.findFirst({
    where: { contentId },
    orderBy: { createdAt: 'desc' },
  });

  let disagreementType = null;
  if (latest && input.action) {
    disagreementType = computeDisagreement(latest.recommendation, input.action);
  }

  return prisma.creatorPublishingDecision.create({
    data: {
      contentId,
      reviewerUserId: context.reviewerUserId ?? null,
      action: input.action,
      reasonCode: input.reasonCode ?? null,
      creatorFeedback: input.creatorFeedback ?? null,
      internalNote: input.internalNote ?? null,
      destinationsJson: input.destinations ?? null,
      classificationId: latest?.id ?? null,
      aiRecommendation: latest?.recommendation ?? null,
      disagreementType,
    },
  });
}

function computeDisagreement(aiRecommendation, humanAction) {
  const approveActions = new Set(['approve', 'publish', 'approve_and_publish']);
  const rejectActions = new Set(['reject']);
  if (aiRecommendation === 'READY_TO_PUBLISH' && rejectActions.has(humanAction)) return 'RISK_UNDERESTIMATED';
  if (aiRecommendation === 'REJECT' && approveActions.has(humanAction)) return 'RISK_OVERESTIMATED';
  if (aiRecommendation === 'HUMAN_REVIEW_REQUIRED' && approveActions.has(humanAction)) return 'POLICY_VERSION_MISMATCH';
  if (aiRecommendation === 'READY_TO_PUBLISH' && humanAction === 'request_changes') return 'QUALITY_DISAGREEMENT';
  return null;
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function approveCreatorPublishing(contentId, input = {}, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');

  const allowedFrom = [
    CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED,
    CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH,
    CREATOR_PUBLISHING_STATUS.ESCALATED,
    CREATOR_PUBLISHING_STATUS.OWNER_REVIEW,
  ];
  if (!allowedFrom.includes(normalizePublishingStatus(existing.status))) {
    throw createCreatorContentTransitionError(existing.status, CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH);
  }

  const destinations = input.destinations ?? DEFAULT_PUBLISHING_DESTINATIONS;

  await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH, {
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
  });

  await prisma.creatorContent.update({
    where: { id: contentId },
    data: { publishingDestinations: destinations },
  });

  const decision = await recordPublishingDecision(contentId, {
    action: input.publishNow ? 'approve_and_publish' : 'approve',
    reasonCode: input.reasonCode ?? null,
    creatorFeedback: input.creatorFeedback ?? null,
    internalNote: input.internalNote ?? null,
    destinations,
  }, context);

  if (input.publishNow !== false) {
    const result = await publishCreatorPublishingContent(contentId, context);
    return { decision, ...result };
  }

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_content_approved',
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
    metadata: { decisionId: decision.id },
  });

  return { decision, content: toPublicCreatorContent(await prisma.creatorContent.findUnique({ where: { id: contentId } })) };
}

/**
 * @param {string} contentId
 * @param {object} context
 */
export async function publishCreatorPublishingContent(contentId, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');

  const result = await publishCreatorContentRecord(contentId, {
    ...context,
    source: 'creator_publishing_center',
  });

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_content_published',
    toStatus: CREATOR_PUBLISHING_STATUS.PUBLISHED,
    actorType: context.actorType ?? 'admin',
    actorId: context.reviewerUserId ?? context.actorId ?? null,
  });

  return result;
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function requestCreatorPublishingChanges(contentId, input = {}, context = {}) {
  const feedback = {
    title: input.creatorFeedback ?? input.feedback ?? '',
    reasonCode: input.reasonCode ?? 'OTHER',
    requestedChanges: input.requestedChanges ?? [],
    internalNote: input.internalNote ?? null,
  };

  await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.CHANGES_REQUESTED, {
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
  });

  const prisma = getPrismaClient();
  await prisma.creatorContent.update({
    where: { id: contentId },
    data: { creatorFeedback: feedback },
  });

  const decision = await recordPublishingDecision(contentId, {
    action: 'request_changes',
    reasonCode: input.reasonCode ?? 'OTHER',
    creatorFeedback: feedback.title,
    internalNote: input.internalNote ?? null,
  }, context);

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_content_changes_requested',
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
    metadata: { decisionId: decision.id, reasonCode: feedback.reasonCode },
  });

  return toPublicCreatorContent(await prisma.creatorContent.findUnique({ where: { id: contentId } }));
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function rejectCreatorPublishing(contentId, input = {}, context = {}) {
  await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.REJECTED, {
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
  });

  const prisma = getPrismaClient();
  const feedback = {
    title: 'Not approved',
    reason: input.creatorFeedback ?? input.reason ?? 'This content does not meet publishing standards.',
    appealEligible: input.appealEligible !== false,
    internalNote: input.internalNote ?? null,
  };

  await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      status: CREATOR_PUBLISHING_STATUS.REJECTED,
      creatorFeedback: feedback,
    },
  });

  const decision = await recordPublishingDecision(contentId, {
    action: 'reject',
    reasonCode: input.reasonCode ?? 'POLICY_CONCERN',
    creatorFeedback: feedback.reason,
    internalNote: input.internalNote ?? null,
  }, context);

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_content_rejected',
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
    metadata: { decisionId: decision.id },
  });

  return toPublicCreatorContent(await prisma.creatorContent.findUnique({ where: { id: contentId } }));
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function escalateCreatorPublishing(contentId, input = {}, context = {}) {
  await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.ESCALATED, {
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
    metadata: { escalationType: input.escalationType ?? 'policy' },
  });

  const decision = await recordPublishingDecision(contentId, {
    action: 'escalate',
    reasonCode: input.reasonCode ?? 'POLICY_CONCERN',
    internalNote: input.internalNote ?? null,
  }, context);

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_content_escalated',
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
    metadata: { decisionId: decision.id, escalationType: input.escalationType ?? null },
  });

  const prisma = getPrismaClient();
  return toPublicCreatorContent(await prisma.creatorContent.findUnique({ where: { id: contentId } }));
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function scheduleCreatorPublishing(contentId, input = {}, context = {}) {
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    throw createCreatorContentError('INVALID_SCHEDULE', 'A valid scheduledAt is required.');
  }

  const prisma = getPrismaClient();
  await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.SCHEDULED, {
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
  });

  await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      scheduledAt,
      publishingDestinations: input.destinations ?? DEFAULT_PUBLISHING_DESTINATIONS,
    },
  });

  const decision = await recordPublishingDecision(contentId, {
    action: 'schedule',
    destinations: input.destinations ?? DEFAULT_PUBLISHING_DESTINATIONS,
    internalNote: input.internalNote ?? null,
  }, context);

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_content_scheduled',
    actorType: 'admin',
    actorId: context.reviewerUserId ?? null,
    metadata: { decisionId: decision.id, scheduledAt: scheduledAt.toISOString() },
  });

  return toPublicCreatorContent(await prisma.creatorContent.findUnique({ where: { id: contentId } }));
}

export default {
  transitionPublishingStatus,
  listCreatorPublishingQueue,
  getCreatorPublishingStats,
  getCreatorPublishingDetail,
  approveCreatorPublishing,
  publishCreatorPublishingContent,
  requestCreatorPublishingChanges,
  rejectCreatorPublishing,
  escalateCreatorPublishing,
  scheduleCreatorPublishing,
  recordPublishingDecision,
};

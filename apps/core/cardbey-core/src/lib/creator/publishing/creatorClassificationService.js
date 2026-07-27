/**
 * Creator classification pipeline — evidence freeze, agent run, persistence.
 */

import { getPrismaClient } from '../../prisma.js';
import {
  classifyCreatorContent,
  validateClassificationEvidence,
} from '../../../agents/creatorClassification/CreatorClassificationAgent.js';
import {
  CREATOR_PUBLISHING_STATUS,
  MODEL_VERSION,
  POLICY_VERSION,
  routeStatusAfterClassification,
} from './creatorPublishingTypes.js';
import { appendPublishingEvent } from './creatorPublishingEventService.js';
import { evaluateAutoApprovalEligibility } from './creatorAutoApprovalPolicy.js';
import { transitionPublishingStatus } from './creatorPublishingService.js';

/**
 * @param {object} content
 * @param {object} creator
 */
export function buildClassificationEvidence(content, creator) {
  const categories = Array.isArray(creator?.categories) ? creator.categories : [];
  const joinedAt = creator?.joinedAt ? new Date(creator.joinedAt) : new Date();
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - joinedAt.getTime()) / 86400000));

  return {
    contentId: content.id,
    creatorId: content.creatorId,
    declaredType: content.type,
    title: content.title,
    description: content.description,
    language: content.language,
    category: categories[0] ?? null,
    thumbnail: content.thumbnail,
    mediaAsset: {
      assetId: content.mediaUrl,
      mediaUrl: content.mediaUrl,
      posterUrl: content.thumbnail,
      durationSeconds: content.durationSeconds,
    },
    article: content.type === 'ARTICLE'
      ? { body: content.description || '', excerpt: content.description?.slice(0, 200) }
      : undefined,
    creatorContext: {
      trustScore: creator?.isQualified ? 0.85 : Math.min(0.8, 0.4 + accountAgeDays / 365),
      previousWarnings: 0,
      previousRejections: 0,
      accountAgeDays,
    },
    frozenAt: new Date().toISOString(),
  };
}

/**
 * @param {string} contentId
 * @param {object} [context]
 */
export async function runCreatorClassification(contentId, context = {}) {
  const prisma = getPrismaClient();
  const content = await prisma.creatorContent.findUnique({
    where: { id: contentId },
    include: { creator: true },
  });
  if (!content) throw new Error('content_not_found');

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_classification_started',
    fromStatus: content.status,
    actorType: context.actorType ?? 'agent',
    actorId: context.actorId ?? MODEL_VERSION,
    metadata: { requestId: context.requestId ?? null },
  });

  const evidence = buildClassificationEvidence(content, content.creator);
  const validation = validateClassificationEvidence(evidence);

  if (!validation.complete) {
    await appendPublishingEvent({
      contentId,
      eventType: 'creator_classification_failed',
      fromStatus: content.status,
      actorType: 'agent',
      metadata: { blockers: validation.blockers, reason: 'incomplete_evidence' },
    });
    return { status: 'pending', blockers: validation.blockers };
  }

  let result;
  try {
    result = classifyCreatorContent(evidence);
  } catch (err) {
    await appendPublishingEvent({
      contentId,
      eventType: 'creator_classification_failed',
      fromStatus: content.status,
      actorType: 'agent',
      metadata: { message: err instanceof Error ? err.message : String(err) },
    });
    await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED, {
      actorType: 'system',
      reason: 'classification_unavailable',
    });
    return { status: 'failed', fallback: CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED };
  }

  const classification = await prisma.creatorClassification.create({
    data: {
      contentId,
      creatorId: content.creatorId,
      modelVersion: MODEL_VERSION,
      policyVersion: POLICY_VERSION,
      resultJson: result,
      recommendation: result.recommendation,
      confidence: result.confidence,
      evidenceJson: evidence,
    },
  });

  const nextStatus = routeStatusAfterClassification(result.recommendation, result.risk);
  const autoEval = evaluateAutoApprovalEligibility({ resultJson: result, confidence: result.confidence });

  await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.AI_REVIEWED, {
    actorType: 'agent',
    actorId: MODEL_VERSION,
    metadata: { classificationId: classification.id },
  });

  await transitionPublishingStatus(contentId, nextStatus, {
    actorType: 'agent',
    actorId: MODEL_VERSION,
    metadata: {
      classificationId: classification.id,
      recommendation: result.recommendation,
      autoApproval: autoEval,
    },
  });

  await appendPublishingEvent({
    contentId,
    eventType: 'creator_classification_completed',
    toStatus: nextStatus,
    actorType: 'agent',
    actorId: MODEL_VERSION,
    metadata: {
      classificationId: classification.id,
      recommendation: result.recommendation,
      confidence: result.confidence,
      overallRisk: result.risk?.overall,
      wouldQualifyForFutureAutoApproval: autoEval.wouldQualifyForFutureAutoApproval,
    },
  });

  return {
    status: 'ok',
    classification,
    result,
    routedTo: nextStatus,
    autoApproval: autoEval,
  };
}

/**
 * Triggered after creator submits for review.
 * @param {string} contentId
 * @param {object} [context]
 */
export async function enqueueCreatorClassificationPipeline(contentId, context = {}) {
  const prisma = getPrismaClient();
  const content = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!content) return null;

  if (content.status === CREATOR_PUBLISHING_STATUS.OWNER_REVIEW) {
    await transitionPublishingStatus(contentId, CREATOR_PUBLISHING_STATUS.CLASSIFICATION_PENDING, {
      actorType: context.actorType ?? 'system',
      actorId: context.actorId ?? null,
    });
  }

  return runCreatorClassification(contentId, context);
}

/**
 * @param {string} contentId
 */
export async function listContentClassifications(contentId) {
  const prisma = getPrismaClient();
  return prisma.creatorClassification.findMany({
    where: { contentId },
    orderBy: { createdAt: 'desc' },
  });
}

export default {
  buildClassificationEvidence,
  runCreatorClassification,
  enqueueCreatorClassificationPipeline,
  listContentClassifications,
};

/**
 * Creator content service — persistence helpers (called from Runtime Authority tools only).
 */

import { getPrismaClient } from '../prisma.js';
import { CREATOR_CONTENT_STATUS, CREATOR_CONTENT_TYPES, toPublicCreator, toPublicCreatorContent } from './creatorTypes.js';
import { CREATOR_PUBLISHING_STATUS, normalizePublishingStatus } from './publishing/creatorPublishingTypes.js';
import { syncCreatorProgress } from './creatorProgressService.js';
import {
  createCreatorProfileError,
  validateCreateCreatorProfileInput,
} from './creatorProfileContract.js';
import { logCreatorProfileTelemetry } from './creatorProfileTelemetry.js';
import { logCreatorContentTelemetry } from './creatorContentTelemetry.js';
import {
  createCreatorContentError,
  createCreatorContentTransitionError,
} from './creatorContentErrors.js';

const VALID_TYPES = new Set(Object.values(CREATOR_CONTENT_TYPES));
export const STUDIO_LIST_STATUSES = [
  CREATOR_CONTENT_STATUS.DRAFT,
  CREATOR_CONTENT_STATUS.OWNER_REVIEW,
  CREATOR_PUBLISHING_STATUS.CLASSIFICATION_PENDING,
  CREATOR_PUBLISHING_STATUS.AI_REVIEWED,
  CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED,
  CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH,
  CREATOR_PUBLISHING_STATUS.CHANGES_REQUESTED,
  CREATOR_PUBLISHING_STATUS.REJECTED,
  CREATOR_PUBLISHING_STATUS.ESCALATED,
  CREATOR_CONTENT_STATUS.PUBLISHED,
  CREATOR_CONTENT_STATUS.FAILED,
];

/**
 * @param {object} record
 * @param {string} type
 */
function assertVideoMediaMetadata(record, type) {
  if (type !== CREATOR_CONTENT_TYPES.VIDEO) return;
  if (!record?.mediaUrl) {
    throw createCreatorContentError(
      'MISSING_MEDIA_ASSET',
      'A persisted video asset is required before saving this content.',
    );
  }
  const duration = Number(record.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw createCreatorContentError(
      'MISSING_TRUSTED_DURATION',
      'Trusted video duration metadata is required before saving this content.',
    );
  }
}

/**
 * @param {string} contentId
 * @param {object} context
 */
export async function returnCreatorContentToDraft(contentId, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');
  if (existing.status !== CREATOR_CONTENT_STATUS.OWNER_REVIEW) {
    const returnable = new Set([
      CREATOR_CONTENT_STATUS.OWNER_REVIEW,
      CREATOR_PUBLISHING_STATUS.CHANGES_REQUESTED,
      CREATOR_PUBLISHING_STATUS.REJECTED,
      CREATOR_CONTENT_STATUS.FAILED,
    ]);
    if (!returnable.has(existing.status)) {
      throw createCreatorContentTransitionError(
        existing.status,
        CREATOR_CONTENT_STATUS.DRAFT,
        'Only content awaiting review can be returned to draft.',
      );
    }
  }

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      status: CREATOR_CONTENT_STATUS.DRAFT,
      runtimeMissionId: context.missionId || existing.runtimeMissionId,
    },
  });

  logCreatorContentTelemetry('creator_content_returned_to_draft', {
    creatorId: row.creatorId,
    contentId: row.id,
    runtimeMissionId: context.missionId ?? null,
    contentType: row.type,
  });

  return toPublicCreatorContent(row);
}

/**
 * @param {object} input
 * @param {object} context
 */
export async function createCreatorContentDraft(input = {}, context = {}) {
  const prisma = getPrismaClient();
  const creatorId = input.creatorId || context.creatorId;
  if (!creatorId) throw new Error('creatorId is required');

  const type = String(input.type || '').toUpperCase();
  if (!VALID_TYPES.has(type)) throw new Error(`Invalid content type: ${type}`);

  assertVideoMediaMetadata(input, type);

  const row = await prisma.creatorContent.create({
    data: {
      creatorId,
      type,
      title: String(input.title || 'Untitled').trim(),
      description: input.description ? String(input.description) : null,
      language: input.language ? String(input.language) : null,
      durationSeconds: input.durationSeconds != null ? Number(input.durationSeconds) : null,
      visibility: input.visibility || 'public',
      thumbnail: input.thumbnail || null,
      mediaUrl: input.mediaUrl || null,
      status: CREATOR_CONTENT_STATUS.DRAFT,
      runtimeMissionId: context.missionId || input.runtimeMissionId || null,
      sourceType: input.sourceType || 'creator_studio',
    },
  });

  logCreatorContentTelemetry('creator_content_draft_created', {
    creatorId: row.creatorId,
    contentId: row.id,
    runtimeMissionId: context.missionId ?? null,
    contentType: row.type,
    assetId: row.mediaUrl ?? null,
  });

  return toPublicCreatorContent(row);
}

/**
 * @param {string} contentId
 * @param {object} input
 * @param {object} context
 */
export async function updateCreatorContentRecord(contentId, input = {}, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');
  if (existing.status === CREATOR_CONTENT_STATUS.DELETED) {
    throw createCreatorContentError('CONTENT_DELETED', 'This content has been deleted.');
  }
  if (existing.status === CREATOR_CONTENT_STATUS.PUBLISHED) {
    throw createCreatorContentTransitionError(
      existing.status,
      CREATOR_CONTENT_STATUS.DRAFT,
      'Published content cannot be edited through the draft workflow.',
    );
  }

  const merged = {
    ...existing,
    ...input,
    type: existing.type,
    mediaUrl: input.mediaUrl != null ? input.mediaUrl : existing.mediaUrl,
    durationSeconds:
      input.durationSeconds != null ? input.durationSeconds : existing.durationSeconds,
  };
  assertVideoMediaMetadata(merged, existing.type);

  const data = {};
  if (input.title != null) data.title = String(input.title).trim();
  if (input.description != null) data.description = String(input.description);
  if (input.language != null) data.language = String(input.language);
  if (input.durationSeconds != null) data.durationSeconds = Number(input.durationSeconds);
  if (input.thumbnail != null) data.thumbnail = input.thumbnail;
  if (input.mediaUrl != null) data.mediaUrl = input.mediaUrl;
  if (input.visibility != null) data.visibility = input.visibility;
  if (input.status != null) data.status = input.status;
  if (context.missionId) data.runtimeMissionId = context.missionId;

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data,
  });

  if (row.status === CREATOR_CONTENT_STATUS.PUBLISHED) {
    await syncCreatorProgress(row.creatorId);
  }

  logCreatorContentTelemetry('creator_content_draft_updated', {
    creatorId: row.creatorId,
    contentId: row.id,
    runtimeMissionId: context.missionId ?? null,
    contentType: row.type,
  });

  return toPublicCreatorContent(row);
}

/**
 * Publish content — Draft → Owner Review → Published flow.
 * @param {string} contentId
 * @param {object} context
 */
export async function publishCreatorContentRecord(contentId, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');

  if (existing.status === CREATOR_CONTENT_STATUS.PUBLISHED) {
    const { progress } = await syncCreatorProgress(existing.creatorId);
    logCreatorContentTelemetry('creator_content_published', {
      creatorId: existing.creatorId,
      contentId: existing.id,
      runtimeMissionId: context.missionId ?? existing.runtimeMissionId ?? null,
      contentType: existing.type,
      idempotent: true,
    });
    return {
      content: toPublicCreatorContent(existing),
      progress,
      alreadyPublished: true,
    };
  }

  const publishableStatuses = new Set([
    CREATOR_CONTENT_STATUS.OWNER_REVIEW,
    CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH,
    CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED,
    CREATOR_PUBLISHING_STATUS.SCHEDULED,
  ]);

  if (!publishableStatuses.has(normalizePublishingStatus(existing.status))) {
    throw createCreatorContentTransitionError(
      existing.status,
      CREATOR_CONTENT_STATUS.PUBLISHED,
      existing.status === CREATOR_CONTENT_STATUS.DRAFT
        ? 'This content must be reviewed before it can be published.'
        : 'This content cannot be published from its current status.',
    );
  }

  assertVideoMediaMetadata(existing, existing.type);

  logCreatorContentTelemetry('creator_content_publish_started', {
    creatorId: existing.creatorId,
    contentId: existing.id,
    runtimeMissionId: context.missionId ?? existing.runtimeMissionId ?? null,
    contentType: existing.type,
    assetId: existing.mediaUrl ?? null,
  });

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      status: CREATOR_CONTENT_STATUS.PUBLISHED,
      publishedAt: new Date(),
      runtimeMissionId: context.missionId || existing.runtimeMissionId,
    },
  });

  const { progress } = await syncCreatorProgress(row.creatorId);

  logCreatorContentTelemetry('creator_content_published', {
    creatorId: row.creatorId,
    contentId: row.id,
    runtimeMissionId: context.missionId ?? row.runtimeMissionId ?? null,
    contentType: row.type,
    durationSeconds: row.durationSeconds,
  });
  logCreatorContentTelemetry('creator_progress_recalculated', {
    creatorId: row.creatorId,
    contentId: row.id,
    totalPublishedSeconds: progress.totalPublishedSeconds,
    totalPublishedMinutes: progress.totalPublishedMinutes,
  });

  return {
    content: toPublicCreatorContent(row),
    progress,
    alreadyPublished: false,
  };
}

/**
 * Draft → Owner Review
 * @param {string} contentId
 * @param {object} context
 */
export async function submitCreatorContentForReview(contentId, context = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw createCreatorContentError('CONTENT_NOT_FOUND', 'Content not found.');

  const alreadyInReview = new Set([
    CREATOR_CONTENT_STATUS.OWNER_REVIEW,
    CREATOR_PUBLISHING_STATUS.CLASSIFICATION_PENDING,
    CREATOR_PUBLISHING_STATUS.AI_REVIEWED,
    CREATOR_PUBLISHING_STATUS.HUMAN_REVIEW_REQUIRED,
    CREATOR_PUBLISHING_STATUS.READY_TO_PUBLISH,
    CREATOR_PUBLISHING_STATUS.SCHEDULED,
    CREATOR_PUBLISHING_STATUS.ESCALATED,
  ]);
  if (alreadyInReview.has(existing.status)) {
    return toPublicCreatorContent(existing);
  }

  const submittable = new Set([
    CREATOR_CONTENT_STATUS.DRAFT,
    CREATOR_PUBLISHING_STATUS.CHANGES_REQUESTED,
    CREATOR_PUBLISHING_STATUS.REJECTED,
    CREATOR_CONTENT_STATUS.FAILED,
  ]);
  if (!submittable.has(existing.status)) {
    throw createCreatorContentTransitionError(
      existing.status,
      CREATOR_CONTENT_STATUS.OWNER_REVIEW,
      'Only drafts or content needing changes can be submitted for review.',
    );
  }

  assertVideoMediaMetadata(existing, existing.type);

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      status: CREATOR_CONTENT_STATUS.OWNER_REVIEW,
      runtimeMissionId: context.missionId || existing.runtimeMissionId,
    },
  });

  logCreatorContentTelemetry('creator_content_review_submitted', {
    creatorId: row.creatorId,
    contentId: row.id,
    runtimeMissionId: context.missionId ?? null,
    contentType: row.type,
  });

  return toPublicCreatorContent(row);
}

/**
 * Soft-delete content.
 * @param {string} contentId
 */
export async function deleteCreatorContentRecord(contentId) {
  const prisma = getPrismaClient();
  const existing = await prisma.creatorContent.findUnique({ where: { id: contentId } });
  if (!existing) throw new Error('content_not_found');

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: { status: CREATOR_CONTENT_STATUS.DELETED },
  });

  await syncCreatorProgress(row.creatorId);
  return toPublicCreatorContent(row);
}

/**
 * @param {string} creatorId
 * @param {object} input
 */
export async function createCreatorProfileRecord(userId, input = {}) {
  const prisma = getPrismaClient();
  const existing = await prisma.creator.findUnique({ where: { userId } });
  if (existing) {
    return toPublicCreator(existing);
  }

  const validation = validateCreateCreatorProfileInput(input);
  if (!validation.ok) {
    const { code, message, fields } = validation.error;
    throw createCreatorProfileError(code, message, fields);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw createCreatorProfileError('USER_NOT_FOUND', 'User account not found.');
  }

  const data = validation.data;
  const usernameTaken = await prisma.creator.findUnique({
    where: { username: data.username },
    select: { id: true },
  });
  if (usernameTaken) {
    throw createCreatorProfileError(
      'CREATOR_USERNAME_TAKEN',
      'That creator username is already in use.',
      { username: 'Choose another username.' },
    );
  }

  logCreatorProfileTelemetry('creator_profile_create_started', { userId, username: data.username });

  try {
    const row = await prisma.creator.create({
      data: {
        userId,
        username: data.username,
        displayName: data.displayName,
        avatar: data.avatar,
        bio: data.bio,
        country: data.country,
        languages: data.languages,
        categories: data.categories,
        banner: data.banner,
      },
    });

    logCreatorProfileTelemetry('creator_profile_create_completed', {
      userId,
      creatorId: row.id,
      username: row.username,
    });

    return toPublicCreator(row);
  } catch (err) {
    logCreatorProfileTelemetry('creator_profile_create_failed', {
      userId,
      username: data.username,
      message: err instanceof Error ? err.message : String(err),
    });
    if (err?.code === 'P2002') {
      throw createCreatorProfileError(
        'CREATOR_USERNAME_TAKEN',
        'That creator username is already in use.',
        { username: 'Choose another username.' },
      );
    }
    throw err;
  }
}

export default {
  createCreatorContentDraft,
  updateCreatorContentRecord,
  submitCreatorContentForReview,
  returnCreatorContentToDraft,
  publishCreatorContentRecord,
  deleteCreatorContentRecord,
  createCreatorProfileRecord,
  STUDIO_LIST_STATUSES,
};

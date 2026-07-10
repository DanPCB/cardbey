/**
 * Creator content service — persistence helpers (called from Runtime Authority tools only).
 */

import { getPrismaClient } from '../prisma.js';
import { CREATOR_CONTENT_STATUS, CREATOR_CONTENT_TYPES, toPublicCreator, toPublicCreatorContent } from './creatorTypes.js';
import { syncCreatorProgress } from './creatorProgressService.js';
import { generateUniqueUsername } from './creatorService.js';

const VALID_TYPES = new Set(Object.values(CREATOR_CONTENT_TYPES));

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
  if (!existing) throw new Error('content_not_found');
  if (existing.status === CREATOR_CONTENT_STATUS.DELETED) throw new Error('content_deleted');

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
  if (!existing) throw new Error('content_not_found');

  if (existing.status !== CREATOR_CONTENT_STATUS.OWNER_REVIEW) {
    throw new Error(`cannot_publish_from_status_${existing.status}`);
  }

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      status: CREATOR_CONTENT_STATUS.PUBLISHED,
      publishedAt: new Date(),
      runtimeMissionId: context.missionId || existing.runtimeMissionId,
    },
  });

  const { progress } = await syncCreatorProgress(row.creatorId);

  return {
    content: toPublicCreatorContent(row),
    progress,
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
  if (!existing) throw new Error('content_not_found');
  if (existing.status !== CREATOR_CONTENT_STATUS.DRAFT) {
    throw new Error(`cannot_submit_review_from_status_${existing.status}`);
  }

  const row = await prisma.creatorContent.update({
    where: { id: contentId },
    data: {
      status: CREATOR_CONTENT_STATUS.OWNER_REVIEW,
      runtimeMissionId: context.missionId || existing.runtimeMissionId,
    },
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, handle: true, avatarUrl: true, bio: true, country: true },
  });
  if (!user) throw new Error('user_not_found');

  const username = await generateUniqueUsername(
    input.username || user.handle || user.displayName || `user-${userId.slice(0, 8)}`,
  );

  const row = await prisma.creator.create({
    data: {
      userId,
      username: username.toLowerCase(),
      displayName: input.displayName || user.displayName || null,
      avatar: input.avatar || user.avatarUrl || null,
      bio: input.bio || user.bio || null,
      country: input.country || user.country || null,
      languages: input.languages || [],
      categories: input.categories || [],
      banner: input.banner || null,
    },
  });

  return toPublicCreator(row);
}

export default {
  createCreatorContentDraft,
  updateCreatorContentRecord,
  submitCreatorContentForReview,
  publishCreatorContentRecord,
  deleteCreatorContentRecord,
  createCreatorProfileRecord,
};

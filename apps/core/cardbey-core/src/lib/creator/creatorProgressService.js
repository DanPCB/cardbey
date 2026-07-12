/**
 * CreatorProgressService — canonical published-minutes engine.
 * Sum(durationSeconds) where status === published; ignores drafts, deleted, failed.
 * Qualification uses seconds internally (18,000 = 300 minutes).
 */

import { getPrismaClient } from '../prisma.js';
import {
  CREATOR_CONTENT_STATUS,
  CREATOR_CONTENT_TYPES,
  QUALIFICATION_MINUTES,
  QUALIFICATION_SECONDS,
} from './creatorTypes.js';

/**
 * @param {string} creatorId
 * @returns {Promise<{ totalPublishedSeconds: number, totalPublishedMinutes: number, totalVideos: number, totalArticles: number, qualificationProgress: number, isQualified: boolean }>}
 */
export async function calculateCreatorProgress(creatorId) {
  const prisma = getPrismaClient();
  const published = await prisma.creatorContent.findMany({
    where: {
      creatorId,
      status: CREATOR_CONTENT_STATUS.PUBLISHED,
    },
    select: {
      type: true,
      durationSeconds: true,
    },
  });

  let totalPublishedSeconds = 0;
  let totalVideos = 0;
  let totalArticles = 0;

  for (const row of published) {
    const secs = Math.max(0, Number(row.durationSeconds) || 0);
    totalPublishedSeconds += secs;
    if (row.type === CREATOR_CONTENT_TYPES.VIDEO) totalVideos += 1;
    if (row.type === CREATOR_CONTENT_TYPES.ARTICLE) totalArticles += 1;
  }

  const totalPublishedMinutes = Math.floor(totalPublishedSeconds / 60);
  const qualificationProgress = Math.min(
    100,
    Math.round((totalPublishedSeconds / QUALIFICATION_SECONDS) * 10000) / 100,
  );
  const isQualified = totalPublishedSeconds >= QUALIFICATION_SECONDS;

  return {
    totalPublishedSeconds,
    totalPublishedMinutes,
    totalVideos,
    totalArticles,
    qualificationProgress,
    isQualified,
  };
}

/**
 * Recalculate and persist progress on Creator row.
 * @param {string} creatorId
 * @returns {Promise<object>}
 */
export async function syncCreatorProgress(creatorId) {
  const prisma = getPrismaClient();
  const progress = await calculateCreatorProgress(creatorId);

  const updated = await prisma.creator.update({
    where: { id: creatorId },
    data: {
      totalPublishedMinutes: progress.totalPublishedMinutes,
      totalVideos: progress.totalVideos,
      totalArticles: progress.totalArticles,
      qualificationProgress: progress.qualificationProgress,
      isQualified: progress.isQualified,
      creatorLevel: progress.isQualified ? 2 : 1,
    },
  });

  return { creator: updated, progress };
}

export { QUALIFICATION_MINUTES, QUALIFICATION_SECONDS } from './creatorTypes.js';

export default {
  calculateCreatorProgress,
  syncCreatorProgress,
  QUALIFICATION_MINUTES,
  QUALIFICATION_SECONDS,
};

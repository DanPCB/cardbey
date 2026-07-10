/**
 * CreatorProgressService — canonical published-minutes engine.
 * Sum(duration) where status === published; ignores drafts, deleted, failed.
 */

import { getPrismaClient } from '../prisma.js';
import {
  CREATOR_CONTENT_STATUS,
  CREATOR_CONTENT_TYPES,
  QUALIFICATION_MINUTES,
} from './creatorTypes.js';

/**
 * @param {string} creatorId
 * @returns {Promise<{ totalPublishedMinutes: number, totalVideos: number, totalArticles: number, qualificationProgress: number, isQualified: boolean }>}
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

  let totalSeconds = 0;
  let totalVideos = 0;
  let totalArticles = 0;

  for (const row of published) {
    const secs = Number(row.durationSeconds) || 0;
    totalSeconds += secs;
    if (row.type === CREATOR_CONTENT_TYPES.VIDEO) totalVideos += 1;
    if (row.type === CREATOR_CONTENT_TYPES.ARTICLE) {
      // Articles count as 1 minute minimum for qualification
      totalArticles += 1;
      if (secs === 0) totalSeconds += 60;
    }
    if (row.type === CREATOR_CONTENT_TYPES.LIVESTREAM && secs === 0) {
      totalSeconds += 60;
    }
  }

  const totalPublishedMinutes = Math.round((totalSeconds / 60) * 100) / 100;
  const qualificationProgress = Math.min(
    100,
    Math.round((totalPublishedMinutes / QUALIFICATION_MINUTES) * 10000) / 100,
  );
  const isQualified = totalPublishedMinutes >= QUALIFICATION_MINUTES;

  return {
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

export { QUALIFICATION_MINUTES } from './creatorTypes.js';

export default {
  calculateCreatorProgress,
  syncCreatorProgress,
  QUALIFICATION_MINUTES,
};

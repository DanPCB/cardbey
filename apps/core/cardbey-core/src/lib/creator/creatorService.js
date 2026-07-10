/**
 * Creator service — read paths and helpers (writes via Runtime Authority tools).
 */

import { getPrismaClient } from '../prisma.js';
import { toPublicCreator, toPublicCreatorContent } from './creatorTypes.js';

/**
 * @param {string} base
 * @returns {string}
 */
function slugifyUsername(base) {
  const slug = String(base || 'creator')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'creator';
}

/**
 * @param {string} preferred
 * @returns {Promise<string>}
 */
export async function generateUniqueUsername(preferred) {
  const prisma = getPrismaClient();
  const base = slugifyUsername(preferred);
  let candidate = base;
  let suffix = 0;
  while (true) {
    const existing = await prisma.creator.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

/**
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getCreatorByUserId(userId) {
  const prisma = getPrismaClient();
  const row = await prisma.creator.findUnique({ where: { userId } });
  return row ? toPublicCreator(row) : null;
}

/**
 * @param {string} username
 * @returns {Promise<object|null>}
 */
export async function getCreatorByUsername(username) {
  const prisma = getPrismaClient();
  const row = await prisma.creator.findUnique({
    where: { username: String(username).toLowerCase() },
  });
  return row ? toPublicCreator(row) : null;
}

/**
 * @param {string} creatorId
 * @returns {Promise<object|null>}
 */
export async function getCreatorById(creatorId) {
  const prisma = getPrismaClient();
  const row = await prisma.creator.findUnique({ where: { id: creatorId } });
  return row ? toPublicCreator(row) : null;
}

/**
 * Deterministic public listing — no recommendation algorithm.
 * @param {{ section?: string, limit?: number }} opts
 */
export async function listPublicCreators(opts = {}) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(Number(opts.limit) || 12, 1), 50);
  const section = opts.section || 'featured';

  let orderBy = { joinedAt: 'desc' };
  if (section === 'featured') orderBy = { totalViews: 'desc' };
  if (section === 'new') orderBy = { joinedAt: 'desc' };
  if (section === 'business') {
    // Business creators: those with categories containing 'business'
    const rows = await prisma.creator.findMany({
      where: { creatorStatus: 'active' },
      orderBy: { totalPublishedMinutes: 'desc' },
      take: limit * 3,
    });
    const filtered = rows.filter((r) => {
      const cats = Array.isArray(r.categories) ? r.categories : [];
      return cats.some((c) => String(c).toLowerCase().includes('business'));
    });
    return filtered.slice(0, limit).map(toPublicCreator);
  }

  const rows = await prisma.creator.findMany({
    where: { creatorStatus: 'active' },
    orderBy,
    take: limit,
  });
  return rows.map(toPublicCreator);
}

/**
 * @param {string} creatorId
 * @param {{ status?: string, limit?: number }} opts
 */
export async function listCreatorContent(creatorId, opts = {}) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(Number(opts.limit) || 24, 1), 100);
  const where = { creatorId };
  if (opts.status) where.status = opts.status;
  else where.status = 'published';

  const rows = await prisma.creatorContent.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toPublicCreatorContent);
}

/**
 * Latest published content across all creators (deterministic).
 * @param {number} limit
 */
export async function listLatestOriginalContent(limit = 12) {
  const prisma = getPrismaClient();
  const rows = await prisma.creatorContent.findMany({
    where: { status: 'published', visibility: 'public' },
    orderBy: { publishedAt: 'desc' },
    take: Math.min(limit, 50),
    include: {
      creator: {
        select: { username: true, displayName: true, avatar: true },
      },
    },
  });
  return rows.map((row) => ({
    ...toPublicCreatorContent(row),
    creator: row.creator
      ? {
          username: row.creator.username,
          displayName: row.creator.displayName,
          avatar: row.creator.avatar,
        }
      : null,
  }));
}

/**
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getCreatorAnalytics(userId) {
  const prisma = getPrismaClient();
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) {
    return {
      videos: 0,
      articles: 0,
      publishedMinutes: 0,
      views: 0,
      likes: 0,
      shares: 0,
      followers: 0,
    };
  }

  const agg = await prisma.creatorContent.aggregate({
    where: { creatorId: creator.id, status: 'published' },
    _sum: { views: true, likes: true, shares: true },
  });

  return {
    videos: creator.totalVideos,
    articles: creator.totalArticles,
    publishedMinutes: creator.totalPublishedMinutes,
    views: agg._sum.views ?? creator.totalViews,
    likes: agg._sum.likes ?? 0,
    shares: agg._sum.shares ?? 0,
    followers: creator.followers,
  };
}

/**
 * Published creator content for the public marketplace feed (Others / Creators lane).
 * @param {number} limit
 */
export async function listCreatorFeedArtifacts(limit = 24) {
  const prisma = getPrismaClient();
  const rows = await prisma.creatorContent.findMany({
    where: { status: 'published', visibility: 'public' },
    orderBy: { publishedAt: 'desc' },
    take: Math.min(limit, 50),
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          country: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    contentId: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    thumbnail: row.thumbnail,
    mediaUrl: row.mediaUrl,
    durationSeconds: row.durationSeconds,
    publishedAt: row.publishedAt,
    views: row.views,
    creator: row.creator
      ? {
          creatorId: row.creator.id,
          username: row.creator.username,
          displayName: row.creator.displayName,
          avatar: row.creator.avatar,
          country: row.creator.country,
        }
      : null,
  }));
}

export default {
  generateUniqueUsername,
  getCreatorByUserId,
  getCreatorByUsername,
  getCreatorById,
  listPublicCreators,
  listCreatorContent,
  listLatestOriginalContent,
  listCreatorFeedArtifacts,
  getCreatorAnalytics,
};

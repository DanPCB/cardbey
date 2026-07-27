/**
 * Public creator showcase — browse published content with filters and search.
 */

import { getPrismaClient } from '../prisma.js';
import { caseInsensitiveFilter } from '../dbCapabilities.js';
import { toPublicCreator, toPublicCreatorContent } from './creatorTypes.js';

const PUBLISHED_PUBLIC = { status: 'published', visibility: 'public' };

const TYPE_FILTER_MAP = Object.freeze({
  videos: 'VIDEO',
  video: 'VIDEO',
  articles: 'ARTICLE',
  article: 'ARTICLE',
  live: 'LIVESTREAM',
  livestream: 'LIVESTREAM',
  services: 'SERVICE',
  service: 'SERVICE',
  'digital-products': 'DIGITAL_PRODUCT',
  digital_product: 'DIGITAL_PRODUCT',
});

const TOPIC_CATEGORIES = new Set([
  'ai',
  'business',
  'education',
  'food',
  'travel',
  'fashion',
  'technology',
  'beauty',
]);

/**
 * @param {string} raw
 * @returns {string|null}
 */
function resolveContentTypeFilter(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key || key === 'all') return null;
  return TYPE_FILTER_MAP[key] ?? null;
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isTopicCategoryFilter(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return TOPIC_CATEGORIES.has(key);
}

/**
 * @param {object} row
 * @param {object|null} creator
 * @returns {object}
 */
function toShowcaseItem(row, creator) {
  const base = toPublicCreatorContent(row);
  const creatorRow = creator ?? row.creator ?? null;
  return {
    ...base,
    creator: creatorRow
      ? {
          creatorId: creatorRow.id ?? creatorRow.creatorId ?? row.creatorId,
          username: creatorRow.username,
          displayName: creatorRow.displayName ?? null,
          avatar: creatorRow.avatar ?? null,
          country: creatorRow.country ?? null,
          categories: Array.isArray(creatorRow.categories) ? creatorRow.categories : [],
          isQualified: Boolean(creatorRow.isQualified),
        }
      : null,
  };
}

/**
 * @param {{ type?: string, category?: string, q?: string, limit?: number, cursor?: string }} opts
 */
export async function listCreatorShowcase(opts = {}) {
  const prisma = getPrismaClient();
  const limit = Math.min(Math.max(Number(opts.limit) || 24, 1), 50);
  const q = String(opts.q || '').trim().toLowerCase();
  const typeFilter = resolveContentTypeFilter(opts.type || opts.category);
  const topicCategory = isTopicCategoryFilter(opts.category) ? String(opts.category).toLowerCase() : null;

  /** @type {import('@prisma/client').Prisma.CreatorContentWhereInput} */
  const where = { ...PUBLISHED_PUBLIC };

  if (typeFilter) {
    where.type = typeFilter;
  }

  if (topicCategory) {
    where.creator = {
      creatorStatus: 'active',
      categories: { has: topicCategory },
    };
  }

  if (q) {
    const titleFilter = caseInsensitiveFilter(q, 'contains');
    const descFilter = caseInsensitiveFilter(q, 'contains');
    const usernameFilter = caseInsensitiveFilter(q, 'contains');
    const displayNameFilter = caseInsensitiveFilter(q, 'contains');
    where.OR = [
      { title: titleFilter },
      { description: descFilter },
      {
        creator: {
          OR: [{ username: usernameFilter }, { displayName: displayNameFilter }],
        },
      },
    ];
  }

  if (opts.cursor) {
    const cursorRow = await prisma.creatorContent.findUnique({
      where: { id: String(opts.cursor) },
      select: { publishedAt: true },
    });
    if (cursorRow?.publishedAt) {
      where.publishedAt = { lt: cursorRow.publishedAt };
    }
  }

  const rows = await prisma.creatorContent.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit + 1,
    include: {
      creator: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          country: true,
          categories: true,
          isQualified: true,
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = page.map((row) => toShowcaseItem(row));

  return {
    items,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    hasMore,
  };
}

/**
 * @param {string} contentId
 */
export async function getPublicCreatorContent(contentId) {
  const prisma = getPrismaClient();
  const row = await prisma.creatorContent.findFirst({
    where: {
      id: String(contentId),
      ...PUBLISHED_PUBLIC,
    },
    include: {
      creator: true,
    },
  });

  if (!row || !row.creator || row.creator.creatorStatus !== 'active') {
    return null;
  }

  return {
    content: toShowcaseItem(row, row.creator),
    creator: toPublicCreator(row.creator),
  };
}

/**
 * @param {{ q?: string, limit?: number }} opts
 */
export async function searchCreatorsShowcase(opts = {}) {
  const prisma = getPrismaClient();
  const q = String(opts.q || '').trim();
  const limit = Math.min(Math.max(Number(opts.limit) || 8, 1), 20);

  if (!q) {
    return { creators: [], content: [] };
  }

  const [creators, contentRows] = await Promise.all([
    prisma.creator.findMany({
      where: {
        creatorStatus: 'active',
        OR: [
          { username: caseInsensitiveFilter(q, 'contains') },
          { displayName: caseInsensitiveFilter(q, 'contains') },
          { bio: caseInsensitiveFilter(q, 'contains') },
        ],
      },
      orderBy: { totalViews: 'desc' },
      take: limit,
    }),
    prisma.creatorContent.findMany({
      where: {
        ...PUBLISHED_PUBLIC,
        OR: [
          { title: caseInsensitiveFilter(q, 'contains') },
          { description: caseInsensitiveFilter(q, 'contains') },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            country: true,
            categories: true,
            isQualified: true,
          },
        },
      },
    }),
  ]);

  return {
    creators: creators.map(toPublicCreator),
    content: contentRows.map((row) => toShowcaseItem(row)),
  };
}

export default {
  listCreatorShowcase,
  getPublicCreatorContent,
  searchCreatorsShowcase,
};

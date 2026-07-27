/**
 * UnclaimedStoreService — CRUD and stats for agent-discovered stores.
 */

import { prisma } from '../prisma.js';
import { slugify } from '../../utils/slug.js';

const PUBLIC_FIELDS = [
  'id', 'slug', 'businessName', 'platform', 'sourceUrl', 'bioText',
  'avatarUrl', 'followerCount', 'category', 'location', 'brandTone',
  'brandStyle', 'socialLinks', 'status', 'preBuiltStoreId', 'createdAt',
  'expiresAt',
];

/**
 * @param {object} data Normalized payload + optional claimAuthority string
 * @param {string} [batchRunId]
 */
export async function upsertFromPayload(data, batchRunId) {
  const sourceUrl = str(data.sourceUrl);
  if (!sourceUrl) {
    throw new Error('sourceUrl is required');
  }

  const existing = await prisma.unclaimedStore.findUnique({
    where: { sourceUrl },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, existed: true };
  }

  const businessName = str(data.businessName) || 'Unnamed Business';
  const slug = await generateUniqueSlug(businessName);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const record = await prisma.unclaimedStore.create({
    data: {
      slug,
      businessName,
      platform: str(data.platform || data.sourcePlatform) || 'unknown',
      sourceUrl,
      bioText: str(data.bioText) || null,
      avatarUrl: str(data.avatarUrl || data.logoUrl) || null,
      followerCount: typeof data.followerCount === 'number' ? data.followerCount : null,
      category: str(data.category || data.businessType) || null,
      location: str(data.location) || null,
      brandTone: str(data.brandTone) || null,
      brandStyle: str(data.brandStyle) || null,
      phone: str(data.phone) || null,
      email: str(data.email) || null,
      address: str(data.address) || null,
      hours: str(data.hours) || null,
      priceRange: str(data.priceRange) || null,
      websiteUrl: str(data.websiteUrl) || null,
      socialLinks: data.socialLinks
        ? (typeof data.socialLinks === 'string' ? data.socialLinks : JSON.stringify(data.socialLinks))
        : null,
      rawVideos: data.rawVideos
        ? (typeof data.rawVideos === 'string' ? data.rawVideos : JSON.stringify(data.rawVideos))
        : null,
      importHashtags: data.importHashtags
        ? (typeof data.importHashtags === 'string' ? data.importHashtags : JSON.stringify(data.importHashtags))
        : null,
      discoveryBatch: batchRunId || null,
      claimAuthority: data.claimAuthority || null,
      status: 'unclaimed',
      expiresAt,
    },
  });

  return { id: record.id, existed: false };
}

export async function setPreBuiltStore(unclaimedStoreId, draftStoreId) {
  return prisma.unclaimedStore.update({
    where: { id: unclaimedStoreId },
    data: { preBuiltStoreId: draftStoreId },
  });
}

export async function getForClaim(id) {
  const record = await prisma.unclaimedStore.findUnique({ where: { id } });
  if (!record) return null;
  return {
    ...record,
    claimAuthority: parseJson(record.claimAuthority, {}),
    socialLinks: parseJson(record.socialLinks, null),
  };
}

export async function getBySlug(slug) {
  const record = await prisma.unclaimedStore.findUnique({ where: { slug } });
  if (!record || record.status !== 'unclaimed') return null;
  return sanitizePublicRecord(record);
}

export async function listByStatus(status, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const cursor = options.cursor || undefined;

  const where = { status };
  if (options.platform) where.platform = options.platform;
  if (options.category) where.category = options.category;
  if (options.location) where.location = { contains: options.location };

  const records = await prisma.unclaimedStore.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = records.length > limit;
  const items = (hasMore ? records.slice(0, limit) : records).map(sanitizePublicRecord);
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return { items, nextCursor, hasMore };
}

export async function expireStale(daysOld = 30) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await prisma.unclaimedStore.updateMany({
    where: {
      status: 'unclaimed',
      createdAt: { lt: cutoff },
      claimedBy: null,
    },
    data: { status: 'expired' },
  });
  return result.count;
}

export async function getDiscoveryStats(since) {
  const sinceDate = since instanceof Date ? since : new Date(since);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUnclaimed,
    totalClaimed,
    totalExpired,
    claimedLast24h,
    claimedLast7d,
    createdLast7d,
    platformGroups,
  ] = await Promise.all([
    prisma.unclaimedStore.count({ where: { status: 'unclaimed' } }),
    prisma.unclaimedStore.count({ where: { status: 'claimed' } }),
    prisma.unclaimedStore.count({ where: { status: 'expired' } }),
    prisma.unclaimedStore.count({
      where: { status: 'claimed', claimedAt: { gte: last24h } },
    }),
    prisma.unclaimedStore.count({
      where: { status: 'claimed', claimedAt: { gte: last7d } },
    }),
    prisma.unclaimedStore.count({
      where: { createdAt: { gte: last7d } },
    }),
    prisma.unclaimedStore.groupBy({
      by: ['platform'],
      where: { createdAt: { gte: sinceDate } },
      _count: { id: true },
    }),
  ]);

  const byPlatform = { tiktok: 0, google: 0, facebook: 0 };
  for (const row of platformGroups) {
    const key = String(row.platform || '').toLowerCase();
    if (key in byPlatform) byPlatform[key] = row._count.id;
    else byPlatform[key] = row._count.id;
  }

  const conversionRate = createdLast7d > 0
    ? Number((claimedLast7d / createdLast7d).toFixed(4))
    : 0;

  return {
    totalUnclaimed,
    totalClaimed,
    totalExpired,
    claimedLast24h,
    claimedLast7d,
    byPlatform,
    conversionRate,
  };
}

export async function markClaimPending(id, userId) {
  const result = await prisma.unclaimedStore.updateMany({
    where: { id, status: 'unclaimed' },
    data: { status: 'claim_pending', claimedBy: userId },
  });
  if (result.count === 0) {
    throw new Error('store_not_claimable');
  }
  return prisma.unclaimedStore.findUnique({ where: { id } });
}

export async function completeClaim(id, userId) {
  const result = await prisma.unclaimedStore.updateMany({
    where: { id, claimedBy: userId, status: 'claim_pending' },
    data: {
      status: 'claimed',
      claimedAt: new Date(),
    },
  });
  if (result.count === 0) {
    throw new Error('claim_not_pending');
  }
  return prisma.unclaimedStore.findUnique({ where: { id } });
}

export async function rejectClaim(id) {
  return prisma.unclaimedStore.update({
    where: { id },
    data: {
      status: 'unclaimed',
      claimedBy: null,
    },
  });
}

export async function createDraftFromUnclaimed(unclaimedStore, userId) {
  const socialLinks = parseJson(unclaimedStore.socialLinks, null);
  const draft = await prisma.draftStore.create({
    data: {
      mode: 'template',
      status: 'draft',
      ownerUserId: userId,
      unclaimedStoreId: unclaimedStore.id,
      brandTone: unclaimedStore.brandTone,
      brandStyle: unclaimedStore.brandStyle,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      input: {
        businessName: unclaimedStore.businessName,
        bioText: unclaimedStore.bioText || '',
        sourceUrl: unclaimedStore.sourceUrl,
        sourcePlatform: unclaimedStore.platform,
        location: unclaimedStore.location || '',
        businessType: unclaimedStore.category || 'general',
        socialLinks,
        source: 'claimed',
        logoUrl: unclaimedStore.avatarUrl || '',
      },
      preview: {
        storeName: unclaimedStore.businessName,
      },
    },
  });
  return draft;
}

async function generateUniqueSlug(base) {
  let slug = slugify(base) || 'store';
  let suffix = 1;
  while (suffix <= 100) {
    const exists = await prisma.unclaimedStore.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) return slug;
    suffix += 1;
    slug = `${slugify(base) || 'store'}-${suffix}`;
  }
  return `${slugify(base) || 'store'}-${Date.now()}`;
}

function sanitizePublicRecord(record) {
  const claimAuthority = parseJson(record.claimAuthority, { methods: ['manual_review'] });
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  out.claimAuthority = {
    methods: Array.isArray(claimAuthority.methods) ? claimAuthority.methods : ['manual_review'],
  };
  return out;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function str(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

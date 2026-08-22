/**
 * Public feed sidebar — real store/offer/activity data for the global frontpage.
 */

import { businessPublicReadSelect } from '../../lib/dbCapabilities.js';
import { isPublicFeedEligibleBusiness } from '../../utils/publicStoreVisibility.js';
import { publicStoreListWhere } from '../publishedArtifactProjection/findPublicBusinesses.js';
import { resolvePublicStoreMediaUrls } from '../../utils/publicUrl.js';
import { batchStoreActivityScores, deriveStoreBadges } from './publicFeedSidebarActivity.js';
import {
  buildSidebarCacheKey,
  getSidebarCache,
  setSidebarCache,
} from './publicFeedSidebarCache.js';

/** @typedef {'geolocation' | 'profile_city' | 'query_city' | 'platform_default'} LocationSource */

export const PLATFORM_DEFAULT_LOCATION = {
  lat: -37.8136,
  lng: 144.9631,
  city: 'Melbourne',
};

const FOOD_KEYWORDS = ['restaurant', 'cafe', 'coffee', 'bakery', 'food', 'dining', 'bar', 'kitchen'];
const RETAIL_KEYWORDS = ['retail', 'shop', 'store', 'boutique', 'market', 'gallery', 'florist'];
const SERVICE_KEYWORDS = ['service', 'beauty', 'salon', 'spa', 'barber', 'wellness', 'clinic'];

/**
 * @param {string | null | undefined} businessType
 * @param {string | null | undefined} category
 */
export function businessMatchesSidebarCategory(businessType, category) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return true;
  const t = String(businessType ?? '').toLowerCase();
  if (!t) return cat === 'others';
  if (cat === 'food') return FOOD_KEYWORDS.some((k) => t.includes(k));
  if (cat === 'products') return RETAIL_KEYWORDS.some((k) => t.includes(k));
  if (cat === 'services') return SERVICE_KEYWORDS.some((k) => t.includes(k));
  return true;
}

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in km
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {object} settings
 */
function readStorefrontFlags(settings) {
  if (!settings || typeof settings !== 'object') {
    return { promoted: false, featuredUntil: null };
  }
  const promoted = settings.promoted === true || settings.isPromoted === true;
  const featuredUntilRaw = settings.featuredUntil ?? settings.featured_until ?? null;
  const featuredUntil = featuredUntilRaw ? new Date(featuredUntilRaw) : null;
  const featuredActive =
    featuredUntil && !Number.isNaN(featuredUntil.getTime()) && featuredUntil > new Date();
  return { promoted: promoted || featuredActive, featuredUntil };
}

/**
 * @param {object} business
 */
function profileCompletenessScore(business) {
  let score = 0;
  if (business.heroImageUrl || business.avatarImageUrl || business.logo) score += 2;
  if (business.tagline || business.description) score += 1;
  if (business.phone || business.websiteUrl) score += 1;
  if (business.lat != null && business.lng != null) score += 1;
  if (business.suburb || business.region) score += 1;
  return score;
}

/**
 * @param {object} business
 * @param {object} ctx
 */
function toSidebarStoreItem(business, ctx) {
  const settings =
    business.storefrontSettings && typeof business.storefrontSettings === 'object'
      ? business.storefrontSettings
      : {};
  const { promoted } = readStorefrontFlags(settings);
  const activity = ctx.activityMap.get(business.id) ?? {
    activityScore: 0,
    views: 0,
    offerViews: 0,
    qrScans: 0,
  };
  const badges = deriveStoreBadges(activity.activityScore, business.publishedAt);
  if (promoted && !badges.includes('HOT')) badges.unshift('FEATURED');

  let distanceKm = null;
  if (
    ctx.viewerLat != null &&
    ctx.viewerLng != null &&
    business.lat != null &&
    business.lng != null
  ) {
    distanceKm = haversineKm(ctx.viewerLat, ctx.viewerLng, business.lat, business.lng);
  }

  const media = resolvePublicStoreMediaUrls({
    heroImageUrl: business.heroImageUrl,
    avatarImageUrl: business.avatarImageUrl,
    logo: business.logo,
  });

  const ownerId = business.userId ?? null;
  const canManage = Boolean(
    ctx.viewerId && ownerId && String(ctx.viewerId) === String(ownerId),
  );

  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    category: business.type ?? null,
    suburb: business.suburb ?? null,
    city: business.city ?? business.region ?? null,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    thumbnailUrl: media.heroImageUrl ?? media.avatarImageUrl ?? null,
    logoUrl: media.avatarImageUrl ?? media.logo ?? null,
    rating: null,
    activityScore: activity.activityScore,
    engagement: activity.engagement ?? {
      followersCount: 0,
      likesCount: 0,
      savesCount: 0,
      sharesCount: 0,
      views7d: activity.views ?? 0,
      engagementScore: activity.activityScore ?? 0,
    },
    badges,
    ownerId: canManage ? ownerId : null,
    canManage,
    promoted,
    publishedAt: business.publishedAt ?? null,
    lat: business.lat ?? null,
    lng: business.lng ?? null,
    href: business.slug ? `/s/${encodeURIComponent(business.slug)}?from=feed` : null,
  };
}

/**
 * @param {object} offer
 * @param {object} store
 * @param {object} ctx
 */
function toSidebarOfferItem(offer, store, ctx) {
  const activity = ctx.activityMap.get(store.id) ?? { activityScore: 0 };
  const badges = [];
  const now = Date.now();
  if (offer.endsAt) {
    const ends = new Date(offer.endsAt).getTime();
    const hoursLeft = (ends - now) / (1000 * 60 * 60);
    if (hoursLeft > 0 && hoursLeft <= 48) badges.push('EXPIRING');
  }
  const created = offer.createdAt ? new Date(offer.createdAt).getTime() : 0;
  if (created && now - created <= 3 * 24 * 60 * 60 * 1000) badges.push('NEW');
  if (activity.activityScore >= 40) badges.push('HOT');

  const media = resolvePublicStoreMediaUrls({
    heroImageUrl: store.heroImageUrl,
    avatarImageUrl: store.avatarImageUrl,
  });

  const canManage = Boolean(
    ctx.viewerId && store.userId && String(ctx.viewerId) === String(store.userId),
  );

  return {
    id: offer.id,
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.name,
    title: offer.title,
    description: offer.description ?? null,
    discountLabel: offer.priceText ?? null,
    thumbnailUrl: media.heroImageUrl ?? media.avatarImageUrl ?? null,
    expiresAt: offer.endsAt ?? null,
    badges,
    ownerId: canManage ? store.userId ?? null : null,
    canManage,
    href: store.slug
      ? `/s/${encodeURIComponent(store.slug)}?from=feed&action=offer`
      : null,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function buildPublicFeedSidebar(prisma, options = {}) {
  const limit = Math.min(Math.max(1, Number(options.limitPerSection) || 5), 10);
  const category = options.category ? String(options.category).trim().toLowerCase() : null;
  const viewerId = options.viewerId ? String(options.viewerId) : null;

  let locationSource = /** @type {LocationSource} */ ('platform_default');
  let viewerLat = PLATFORM_DEFAULT_LOCATION.lat;
  let viewerLng = PLATFORM_DEFAULT_LOCATION.lng;
  let locationLabel = PLATFORM_DEFAULT_LOCATION.city;

  if (
    options.lat != null &&
    options.lng != null &&
    !Number.isNaN(Number(options.lat)) &&
    !Number.isNaN(Number(options.lng))
  ) {
    viewerLat = Number(options.lat);
    viewerLng = Number(options.lng);
    locationSource = 'geolocation';
    locationLabel = null;
  } else if (options.profileCity) {
    locationSource = 'profile_city';
    locationLabel = String(options.profileCity);
  } else if (options.city) {
    locationSource = 'query_city';
    locationLabel = String(options.city);
  }

  const cacheKey = buildSidebarCacheKey({
    lat: viewerLat,
    lng: viewerLng,
    city: locationLabel,
    category,
    limitPerSection: limit,
    viewerId: viewerId ?? 'anon',
  });
  const cached = getSidebarCache(cacheKey);
  if (cached) return cached;

  const select = {
    ...businessPublicReadSelect(),
    city: true,
  };

  let businesses = await prisma.business.findMany({
    where: publicStoreListWhere(),
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 250,
    select,
  });

  businesses = businesses.filter(isPublicFeedEligibleBusiness);
  if (category) {
    businesses = businesses.filter((b) => businessMatchesSidebarCategory(b.type, category));
  }

  const storeIds = businesses.map((b) => b.id);
  const activityMap = await batchStoreActivityScores(prisma, storeIds);

  const ctx = {
    viewerId,
    viewerLat: locationSource === 'geolocation' ? viewerLat : null,
    viewerLng: locationSource === 'geolocation' ? viewerLng : null,
    activityMap,
  };

  const storeItems = businesses.map((b) => toSidebarStoreItem(b, ctx));
  const storeById = new Map(businesses.map((b) => [b.id, b]));
  const usedStoreIds = new Set();

  const takeUnique = (items, getStoreId) => {
    const out = [];
    for (const item of items) {
      const sid = getStoreId(item);
      if (!sid || usedStoreIds.has(sid)) continue;
      usedStoreIds.add(sid);
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  };

  const featuredNow = takeUnique(
    [...storeItems]
      .sort((a, b) => {
        if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
        if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
        const aPub = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bPub = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return bPub - aPub;
      })
      .filter((s) => s.thumbnailUrl || s.activityScore > 0 || s.promoted),
    (i) => i.id,
  );

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const newThisWeek = takeUnique(
    storeItems
      .filter((s) => {
        if (!s.publishedAt) return false;
        const pub = new Date(s.publishedAt);
        return !Number.isNaN(pub.getTime()) && pub >= weekAgo;
      })
      .sort((a, b) => {
        const aPub = new Date(a.publishedAt).getTime();
        const bPub = new Date(b.publishedAt).getTime();
        if (bPub !== aPub) return bPub - aPub;
        return (
          profileCompletenessScore(storeById.get(b.id)) -
          profileCompletenessScore(storeById.get(a.id))
        );
      }),
    (i) => i.id,
  );

  const withCoords = storeItems.filter((s) => {
    const b = storeById.get(s.id);
    return b?.lat != null && b?.lng != null;
  });

  let nearbyBusinesses = [];
  if (locationSource === 'geolocation' && withCoords.length) {
    nearbyBusinesses = takeUnique(
      [...withCoords].sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)),
      (i) => i.id,
    );
  } else if (locationLabel) {
    const cityLower = locationLabel.toLowerCase();
    nearbyBusinesses = takeUnique(
      storeItems
        .filter((s) => {
          const city = String(s.city ?? '').toLowerCase();
          const suburb = String(s.suburb ?? '').toLowerCase();
          return city.includes(cityLower) || suburb.includes(cityLower);
        })
        .sort((a, b) => b.activityScore - a.activityScore),
      (i) => i.id,
    );
  }
  if (!nearbyBusinesses.length) {
    nearbyBusinesses = takeUnique(
      [...storeItems].sort((a, b) => b.activityScore - a.activityScore),
      (i) => i.id,
    );
  }

  const now = new Date();
  const offers = await prisma.storeOffer.findMany({
    where: {
      isActive: true,
      storeId: { in: storeIds },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
    },
    orderBy: [{ endsAt: 'asc' }, { updatedAt: 'desc' }],
    take: limit * 4,
    select: {
      id: true,
      storeId: true,
      title: true,
      description: true,
      priceText: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
    },
  });

  const activeOffers = [];
  for (const offer of offers) {
    const store = storeById.get(offer.storeId);
    if (!store) continue;
    activeOffers.push(toSidebarOfferItem(offer, store, ctx));
    if (activeOffers.length >= limit) break;
  }

  const nearbySectionTitle =
    locationSource === 'geolocation'
      ? 'Nearby businesses'
      : locationLabel
        ? `Businesses near ${locationLabel}`
        : 'Recommended businesses';

  const payload = {
    ok: true,
    featuredNow,
    nearbyBusinesses,
    activeOffers,
    newThisWeek,
    generatedAt: new Date().toISOString(),
    locationSource,
    locationLabel,
    nearbySectionTitle,
  };

  setSidebarCache(cacheKey, payload);
  return payload;
}

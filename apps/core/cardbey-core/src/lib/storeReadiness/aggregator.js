/**
 * Store Readiness Aggregator — loads store+products, runs rules, builds snapshot.
 */

import { runStoreReadinessRules } from './rules.js';
import { buildSectionFromFindings } from './findings.js';
import {
  computeOverallScore,
  computeStatus,
  prioritizeFindings,
} from './prioritize.js';
import { sanitizeStoreReadinessSnapshot } from './sanitize.js';
import { resolveBusinessVertical } from './verticalRules.js';
import { buildReadinessDiagnostics } from './diagnostics.js';

const SECTION_KEYS = [
  'businessProfile',
  'branding',
  'catalog',
  'storefront',
  'contactAndLocation',
  'commerce',
  'marketing',
  'trustAndCompliance',
];

/**
 * Build snapshot from already-normalized store input (no DB).
 * @param {object} storeInput
 * @returns {import('./types.js').StoreReadinessSnapshot}
 */
export function buildStoreReadinessSnapshot(storeInput) {
  const generatedAt = storeInput.generatedAt || new Date().toISOString();
  const store = { ...storeInput, generatedAt };
  const findings = runStoreReadinessRules(store);

  /** @type {Record<string, import('./types.js').ReadinessSection>} */
  const sections = {};
  for (const key of SECTION_KEYS) {
    sections[key] = buildSectionFromFindings(findings, key);
  }

  const { recommendedActions, primaryActions } = prioritizeFindings(findings, {
    maxPrimary: 3,
  });
  const overallScore = computeOverallScore(findings, sections);
  const isLive =
    store.published === true ||
    store.isPublic === true ||
    ['public', 'published', 'live'].includes(String(store.visibility || '').toLowerCase());

  const snapshot = {
    storeId: String(store.id || store.storeId || ''),
    ownerUserId: String(store.ownerUserId || store.userId || ''),
    generatedAt,
    overallScore,
    status: computeStatus(overallScore, findings, { isLive }),
    vertical: resolveBusinessVertical(store.type || store.category || store.vertical),
    sections: {
      businessProfile: sections.businessProfile,
      branding: sections.branding,
      catalog: sections.catalog,
      storefront: sections.storefront,
      contactAndLocation: sections.contactAndLocation,
      commerce: sections.commerce,
      marketing: sections.marketing,
      trustAndCompliance: sections.trustAndCompliance,
    },
    findings,
    recommendedActions,
    primaryActions,
  };

  const withDiag = {
    ...snapshot,
    diagnostics: buildReadinessDiagnostics(snapshot, { storeInput: store }),
  };

  return sanitizeStoreReadinessSnapshot(withDiag);
}

/**
 * Parse Business.logo JSON string → URL.
 * @param {unknown} logo
 */
function extractLogoUrl(logo) {
  if (!logo) return null;
  if (typeof logo === 'string') {
    const trimmed = logo.trim();
    if (trimmed.startsWith('{')) {
      const parsed = safeJson(trimmed);
      return parsed.url || parsed.src || null;
    }
    return trimmed;
  }
  if (typeof logo === 'object' && logo.url) return logo.url;
  return null;
}

/**
 * Normalize Prisma Business + Product rows into rule input.
 * Maps real schema fields (tradingHours, publishedAt, avatarImageUrl, ctaLabel, …).
 * @param {object} business
 * @param {object[]} products
 * @param {object} [extras]
 */
export function normalizeBusinessForReadiness(business, products = [], extras = {}) {
  const storefront =
    business?.storefrontSettings && typeof business.storefrontSettings === 'object'
      ? business.storefrontSettings
      : typeof business?.storefrontSettings === 'string'
        ? safeJson(business.storefrontSettings)
        : {};
  const stylePrefs =
    business?.stylePreferences && typeof business.stylePreferences === 'object'
      ? business.stylePreferences
      : typeof business?.stylePreferences === 'string'
        ? safeJson(business.stylePreferences)
        : {};

  const logoUrl =
    business.avatarImageUrl || extractLogoUrl(business.logo) || extras.logoUrl || null;
  const published =
    extras.published ??
    (business.publishedAt != null || business.isActive === true);
  // Draft/unpublished: no publishedAt and explicitly inactive, or extras override
  const isDraftLike =
    extras.forceHidden === true ||
    (business.publishedAt == null && business.isGuestDraft === true) ||
    business.isActive === false;

  const ctaLabel = business.ctaLabel || storefront.ctaLabel || extras.ctaLabel;
  const ctaUrl = storefront.ctaUrl || storefront.ctaDestination || extras.ctaUrl;
  const transactionMode = String(business.transactionMode || 'order').toLowerCase();

  return {
    id: business.id,
    storeId: business.id,
    ownerUserId: business.userId,
    userId: business.userId,
    name: business.name,
    category: business.type,
    type: business.type,
    description: business.description,
    phone: business.phone,
    email: business.email,
    address: business.address || business.formattedAddress,
    location: [business.suburb, business.city, business.state].filter(Boolean).join(', ') || null,
    serviceArea: extras.serviceArea || storefront.serviceArea || null,
    serviceRadiusKm: extras.serviceRadiusKm ?? storefront.serviceRadiusKm ?? null,
    hours: business.tradingHours || extras.hours,
    logoUrl,
    heroImageUrl: business.heroImageUrl || extras.heroImageUrl,
    heroVideoUrl: extras.heroVideoUrl || storefront.heroVideoUrl || null,
    heroVideoPlayable: extras.heroVideoPlayable ?? storefront.heroVideoPlayable,
    heroMediaFailed: extras.heroMediaFailed ?? storefront.heroMediaFailed,
    heroImageWidth: extras.heroImageWidth ?? storefront.heroImageWidth,
    published: isDraftLike ? false : published,
    isPublic: isDraftLike ? false : published,
    visibility: isDraftLike ? 'draft' : published ? 'published' : 'draft',
    cta: extras.cta || (ctaLabel || ctaUrl ? { label: ctaLabel, destination: ctaUrl } : null),
    ctaLabel,
    ctaUrl,
    blockingMediaState: extras.blockingMediaState ?? storefront.blockingMediaState,
    hasQuotePath: extras.hasQuotePath ?? transactionMode === 'quote',
    hasBookingPath: extras.hasBookingPath ?? transactionMode === 'booking',
    hasEnquiryPath: extras.hasEnquiryPath ?? Boolean(business.phone || business.email),
    hasCheckoutPath: extras.hasCheckoutPath ?? transactionMode === 'order',
    commercePaths: extras.commercePaths || storefront.commercePaths,
    notificationEmail: extras.notificationEmail || business.email,
    notificationPhone: extras.notificationPhone || business.phone,
    requiresFulfilment: extras.requiresFulfilment ?? storefront.requiresFulfilment,
    fulfilmentMethod: extras.fulfilmentMethod || storefront.fulfilmentMethod,
    serviceMethod: extras.serviceMethod || storefront.serviceMethod,
    tagline: business.tagline || stylePrefs.tagline,
    slogan: business.tagline,
    claimsUnverified:
      extras.claimsUnverified ??
      (business.claimStatus != null &&
        String(business.claimStatus).toLowerCase() !== 'verified' &&
        String(business.claimStatus).toLowerCase() !== 'claimed'),
    serviceOptions: extras.serviceOptions || storefront.serviceOptions || [],
    draftId: extras.draftId || null,
    products: (products || []).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      description: p.description,
      imageUrl: p.imageUrl || p.image,
      category: p.category || p.categoryName,
      categoryName: p.categoryName,
      isPublished: p.isPublished ?? p.published,
      deletedAt: p.deletedAt || null,
    })),
    generatedAt: extras.generatedAt,
  };
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Load store from Prisma and build readiness snapshot.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {{ draftId?: string }} [opts]
 */
export async function aggregateStoreReadiness(prisma, storeId, opts = {}) {
  const business = await prisma.business.findUnique({
    where: { id: String(storeId) },
  });
  if (!business) return null;

  let products = [];
  try {
    products = await prisma.product.findMany({
      where: { businessId: business.id },
      select: {
        id: true,
        name: true,
        price: true,
        description: true,
        imageUrl: true,
        category: true,
        isPublished: true,
        deletedAt: true,
      },
    });
  } catch {
    // Some schemas use storeId instead of businessId
    try {
      products = await prisma.product.findMany({
        where: { storeId: business.id },
        select: {
          id: true,
          name: true,
          price: true,
          description: true,
          imageUrl: true,
          category: true,
          isPublished: true,
          deletedAt: true,
        },
      });
    } catch {
      products = [];
    }
  }

  const input = normalizeBusinessForReadiness(business, products, {
    draftId: opts.draftId || null,
    generatedAt: new Date().toISOString(),
  });
  return buildStoreReadinessSnapshot(input);
}

/**
 * Verify authenticated user owns the store.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {string} userId
 */
export async function assertStoreOwner(prisma, storeId, userId) {
  if (!userId) return { ok: false, reason: 'unauthenticated' };
  const business = await prisma.business.findUnique({
    where: { id: String(storeId) },
    select: { id: true, userId: true },
  });
  if (!business) return { ok: false, reason: 'not_found' };
  if (String(business.userId) !== String(userId)) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, business };
}

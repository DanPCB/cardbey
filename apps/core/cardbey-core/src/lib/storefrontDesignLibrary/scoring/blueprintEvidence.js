/**
 * Gather scoring evidence from Phase 2/3 metadata + available facts.
 * Does not re-run research or inspect React layout.
 */

import { NOISE_CONTENT_ROLES } from './scoringWeights.js';
import { getPreviewSample } from '../registries/index.js';

/**
 * @typedef {{
 *   businessModel: string,
 *   businessModelConfidence: number,
 *   primaryAction: string | null,
 *   secondaryActions: string[],
 *   roleCounts: Record<string, number>,
 *   presentRoles: string[],
 *   offeringRoles: string[],
 *   trustRoles: string[],
 *   hasBookingEvidence: boolean,
 *   hasPricedPurchasableProduct: boolean,
 *   hasMenuEvidence: boolean,
 *   hasProductEvidence: boolean,
 *   hasServiceEvidence: boolean,
 *   hasProjectOrGallery: boolean,
 *   hasTestimonials: boolean,
 *   hasTrustContent: boolean,
 *   hasPhone: boolean,
 *   hasLocation: boolean,
 *   hasImages: boolean,
 *   hasHours: boolean,
 *   availableData: Record<string, boolean>,
 *   businessName: string | null,
 *   preferredBlueprintId: string | null,
 *   preferredPreviewSampleId: string | null,
 *   classificationTotal: number,
 *   classificationLowConfidenceCount: number,
 *   catalogGrounding: {
 *     contentOrigin: string | null,
 *     catalogSource: string | null,
 *     pendingOwnerReview: boolean,
 *   },
 * }} BlueprintScoringEvidence
 */

const OFFERING_ROLES = new Set([
  'service',
  'service_category',
  'product',
  'product_category',
  'menu_item',
  'menu_category',
  'project',
]);

const TRUST_ROLES = new Set(['testimonial', 'trust_content', 'gallery', 'about', 'location']);

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @returns {BlueprintScoringEvidence}
 */
export function gatherBlueprintScoringEvidence(catalog, context = {}) {
  const meta = catalog?.meta && typeof catalog.meta === 'object' ? catalog.meta : {};
  const policy = meta.designLibraryCommercePolicy && typeof meta.designLibraryCommercePolicy === 'object'
    ? meta.designLibraryCommercePolicy
    : {};
  const classification =
    meta.contentClassification && typeof meta.contentClassification === 'object'
      ? meta.contentClassification
      : {};

  /** @type {Record<string, number>} */
  const roleCounts = {};
  if (classification.counts && typeof classification.counts === 'object') {
    for (const [role, n] of Object.entries(classification.counts)) {
      roleCounts[role] = Number(n) || 0;
    }
  }
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') continue;
    const role = String(raw.contentRole ?? '').trim();
    if (!role) continue;
    if (!(role in roleCounts)) roleCounts[role] = 0;
    // Prefer classification summary when present; otherwise count from products.
    if (!classification.counts) roleCounts[role] += 1;
  }
  // If classification.counts exists, trust it; else we counted products above.
  // When both exist, ensure product-derived roles not in summary are included.
  if (classification.counts) {
    for (const raw of products) {
      if (!raw || typeof raw !== 'object') continue;
      const role = String(raw.contentRole ?? '').trim();
      if (role && roleCounts[role] == null) roleCounts[role] = 1;
    }
  }

  const presentRoles = Object.keys(roleCounts)
    .filter((r) => roleCounts[r] > 0)
    .sort();
  const offeringRoles = presentRoles.filter((r) => OFFERING_ROLES.has(r));
  const trustRoles = presentRoles.filter((r) => TRUST_ROLES.has(r));

  const evidenceSummary =
    policy.evidenceSummary && typeof policy.evidenceSummary === 'object'
      ? policy.evidenceSummary
      : {};

  const facts =
    (context.research?.facts && typeof context.research.facts === 'object'
      ? context.research.facts
      : null) ||
    (context.facts && typeof context.facts === 'object' ? context.facts : {}) ||
    {};

  const businessName = String(
    context.businessName ??
      catalog?.profile?.name ??
      meta.businessName ??
      facts.businessName ??
      facts.name ??
      '',
  ).trim() || null;

  const phone = String(
    context.phone ?? facts.phone ?? catalog?.profile?.phone ?? meta.phone ?? '',
  ).trim();
  const bookingUrlResolved = String(context.bookingUrl ?? facts.bookingUrl ?? '').trim();
  const bookingProvider = String(
    context.bookingProvider ?? context.research?.bookingProvider ?? '',
  ).trim();

  const hasBookingEvidence = Boolean(
    bookingUrlResolved ||
      bookingProvider ||
      evidenceSummary.hasBookingUrl ||
      evidenceSummary.hasBookingProvider,
  );
  const hasPricedPurchasableProduct = Boolean(evidenceSummary.hasPricedPurchasableProduct);
  const hasMenuEvidence =
    (roleCounts.menu_item ?? 0) + (roleCounts.menu_category ?? 0) > 0 ||
    Boolean(facts.menu || facts.menuUrl);
  const hasProductEvidence =
    (roleCounts.product ?? 0) + (roleCounts.product_category ?? 0) > 0 || hasPricedPurchasableProduct;
  const hasServiceEvidence =
    (roleCounts.service ?? 0) + (roleCounts.service_category ?? 0) > 0;
  const hasProjectOrGallery =
    (roleCounts.project ?? 0) + (roleCounts.gallery ?? 0) > 0 ||
    Boolean(facts.projects || context.hasProjects);
  const hasTestimonials = (roleCounts.testimonial ?? 0) > 0 || Boolean(facts.testimonials);
  const hasTrustContent = (roleCounts.trust_content ?? 0) > 0;
  const hasPhone = Boolean(phone) || Boolean(evidenceSummary.hasPhone);
  const hasLocation =
    (roleCounts.location ?? 0) > 0 ||
    Boolean(facts.address || facts.location || facts.serviceArea || context.serviceArea);
  const images = context.images ?? facts.images ?? catalog?.media?.images;
  const hasImages = Array.isArray(images) ? images.length > 0 : Boolean(images || facts.heroImage);
  const hasHours = Boolean(facts.hours || facts.openingHours || context.hours);

  const availableData = {
    businessName: Boolean(businessName),
    phone: hasPhone,
    bookingUrl: hasBookingEvidence,
    hours: hasHours,
    menu: hasMenuEvidence,
    products: hasProductEvidence,
    testimonials: hasTestimonials,
    projects: hasProjectOrGallery,
    serviceArea: hasLocation || Boolean(facts.serviceArea),
    gallery: (roleCounts.gallery ?? 0) > 0 || hasImages,
    team: Boolean(facts.team || context.team),
    reservationUrl: Boolean(facts.reservationUrl || context.reservationUrl),
    deliveryUrl: Boolean(facts.deliveryUrl || context.deliveryUrl),
    brands: Boolean(facts.brands || context.brands),
    process: Boolean(facts.process),
  };

  const preferredBlueprintId = resolvePreferredBlueprintId(context, meta);
  const preferredPreviewSampleId = String(
    context.preferredPreviewSampleId ??
      context.previewSampleId ??
      meta.preferredPreviewSampleId ??
      meta.previewSampleId ??
      '',
  ).trim() || null;

  return Object.freeze({
    businessModel: String(policy.businessModel ?? context.businessModel ?? 'mixed'),
    businessModelConfidence: Number(policy.businessModelConfidence ?? context.businessModelConfidence ?? 0.4),
    primaryAction: policy.primaryAction ?? context.primaryAction ?? null,
    secondaryActions: [
      ...(policy.secondaryAction ? [policy.secondaryAction] : []),
      ...(Array.isArray(context.secondaryActions) ? context.secondaryActions : []),
    ].filter(Boolean),
    roleCounts: Object.freeze({ ...roleCounts }),
    presentRoles: Object.freeze(presentRoles),
    offeringRoles: Object.freeze(offeringRoles),
    trustRoles: Object.freeze(trustRoles),
    hasBookingEvidence,
    hasPricedPurchasableProduct,
    hasMenuEvidence,
    hasProductEvidence,
    hasServiceEvidence,
    hasProjectOrGallery,
    hasTestimonials,
    hasTrustContent,
    hasPhone,
    hasLocation,
    hasImages,
    hasHours,
    availableData: Object.freeze({ ...availableData }),
    businessName,
    preferredBlueprintId,
    preferredPreviewSampleId,
    classificationTotal: Number(classification.totalItems ?? products.length) || 0,
    classificationLowConfidenceCount: Number(classification.lowConfidenceCount ?? 0) || 0,
    catalogGrounding: Object.freeze({
      contentOrigin: meta.contentOrigin ?? null,
      catalogSource: meta.catalogSource ?? null,
      pendingOwnerReview: Boolean(meta.pendingOwnerReview || meta.needsOwnerReview),
    }),
  });
}

/**
 * @param {Record<string, unknown>} context
 * @param {Record<string, unknown>} meta
 */
function resolvePreferredBlueprintId(context, meta) {
  const direct = String(
    context.preferredBlueprintId ?? meta.preferredBlueprintId ?? '',
  ).trim();
  if (direct) return direct;

  const sampleId = String(
    context.preferredPreviewSampleId ??
      context.previewSampleId ??
      meta.preferredPreviewSampleId ??
      meta.previewSampleId ??
      '',
  ).trim();
  if (!sampleId) return null;
  const sample = getPreviewSample(sampleId);
  return sample?.blueprintId ?? null;
}

/** @param {string} role */
export function isNoiseContentRole(role) {
  return NOISE_CONTENT_ROLES.includes(role);
}

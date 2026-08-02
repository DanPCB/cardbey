/**
 * Gather projection evidence from Phase 2–4 metadata + catalog rows.
 * Does not re-run research or invent facts/prices.
 */

import { mapContentRoleToSection } from './contentRoleMapper.js';
import { getBlueprint } from '../registries/index.js';

/** Minimum role confidence to include in a visible section (0–1). */
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.45;

/**
 * @typedef {{
 *   ref: string,
 *   index: number,
 *   contentRole: string,
 *   contentOrigin: 'sourced'|'suggested'|string,
 *   needsOwnerReview: boolean,
 *   roleConfidence: number,
 *   name: string,
 *   url: string,
 *   parentRef: string | null,
 *   groupKey: string | null,
 *   item: Record<string, unknown>,
 * }} ProjectionItem
 *
 * @typedef {{
 *   blueprint: import('../contracts/blueprint.js').StorefrontBlueprint,
 *   businessModel: string,
 *   primaryAction: string,
 *   secondaryActions: string[],
 *   items: ProjectionItem[],
 *   itemsByRef: Map<string, ProjectionItem>,
 *   roleCounts: Record<string, number>,
 *   hasMedia: boolean,
 *   hasLocationEvidence: boolean,
 *   hasHoursEvidence: boolean,
 *   hasBookingEvidence: boolean,
 *   businessName: string | null,
 *   themeId: string | null,
 *   previewSampleId: string | null,
 *   pendingOwnerReview: boolean,
 * }} ProjectionEvidence
 */

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @returns {ProjectionEvidence | null}
 */
export function gatherProjectionEvidence(catalog, context = {}) {
  const meta = catalog?.meta && typeof catalog.meta === 'object' ? catalog.meta : {};
  const recommendation = meta.designLibraryBlueprintRecommendation;
  const policy = meta.designLibraryCommercePolicy ?? {};
  const blueprintId = String(
    recommendation?.selectedBlueprintId ?? context.blueprintId ?? '',
  ).trim();
  if (!blueprintId) return null;

  const blueprint = getBlueprint(blueprintId);
  if (!blueprint) return null;

  const sectionRoles = new Set(blueprint.defaultSections.map((s) => s.role));
  const hasServiceAreaSection = sectionRoles.has('service_area');
  const hasLocationSection = sectionRoles.has('location');

  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  /** @type {ProjectionItem[]} */
  const items = [];
  const itemsByRef = new Map();
  /** @type {Record<string, number>} */
  const roleCounts = {};

  products.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (raw);
    const contentRole = String(item.contentRole ?? 'unknown').trim() || 'unknown';
    roleCounts[contentRole] = (roleCounts[contentRole] ?? 0) + 1;

    const ref = resolveItemRef(item, index);
    const mapped = mapContentRoleToSection(contentRole, {
      hasServiceAreaSection,
      hasLocationSection,
    });

    const projectionItem = {
      ref,
      index,
      contentRole,
      contentOrigin: normalizeOrigin(item.contentOrigin ?? meta.contentOrigin),
      needsOwnerReview: Boolean(item.needsOwnerReview),
      roleConfidence: Number(item.roleConfidence ?? 1),
      name: String(item.name ?? item.title ?? '').trim(),
      url: String(item.url ?? item.sourceUrl ?? '').trim(),
      parentRef: item.parentId != null ? String(item.parentId) : null,
      groupKey: deriveGroupKey(item, contentRole),
      mappedSection: mapped,
      item,
    };
    items.push(projectionItem);
    itemsByRef.set(ref, projectionItem);
  });

  const facts =
    (context.facts && typeof context.facts === 'object' ? context.facts : null) ||
    (context.research?.facts && typeof context.research.facts === 'object'
      ? context.research.facts
      : {}) ||
    {};

  const images = context.images ?? facts.images ?? catalog?.media?.images;
  const hasMedia =
    Array.isArray(images) ? images.length > 0 : Boolean(images || facts.heroImage || context.hasMedia);
  const hasLocationEvidence = Boolean(
    facts.address ||
      facts.location ||
      facts.serviceArea ||
      context.serviceArea ||
      (roleCounts.location ?? 0) > 0,
  );
  const hasHoursEvidence = Boolean(facts.hours || facts.openingHours || context.hours);
  const evidenceSummary = policy.evidenceSummary ?? {};
  const hasBookingEvidence = Boolean(
    evidenceSummary.hasBookingUrl ||
      evidenceSummary.hasBookingProvider ||
      context.bookingUrl ||
      facts.bookingUrl,
  );

  const classification =
    meta.contentClassification?.counts && typeof meta.contentClassification.counts === 'object'
      ? meta.contentClassification.counts
      : roleCounts;

  return {
    blueprint,
    businessModel: String(policy.businessModel ?? 'mixed'),
    primaryAction: String(policy.primaryAction ?? 'enquire'),
    secondaryActions: [
      ...(policy.secondaryAction ? [String(policy.secondaryAction)] : []),
    ].filter(Boolean),
    items,
    itemsByRef,
    roleCounts: { ...classification },
    hasMedia,
    hasLocationEvidence,
    hasHoursEvidence,
    hasBookingEvidence,
    businessName: String(
      context.businessName ?? catalog?.profile?.name ?? meta.businessName ?? '',
    ).trim() || null,
    themeId: String(context.themeId ?? meta.themeId ?? meta.visualThemeId ?? '').trim() || null,
    previewSampleId:
      String(
        context.previewSampleId ??
          context.preferredPreviewSampleId ??
          meta.previewSampleId ??
          meta.preferredPreviewSampleId ??
          '',
      ).trim() || null,
    pendingOwnerReview: Boolean(meta.pendingOwnerReview || meta.needsOwnerReview),
  };
}

/**
 * @param {Record<string, unknown>} item
 * @param {number} index
 */
export function resolveItemRef(item, index) {
  if (item.id != null && String(item.id).trim()) return String(item.id).trim();
  if (item.sku != null && String(item.sku).trim()) return `sku:${String(item.sku).trim()}`;
  const url = String(item.url ?? item.sourceUrl ?? '').trim();
  if (url) return `url:${url}`;
  const name = String(item.name ?? item.title ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if (name) return `name:${name}:${index}`;
  return `item:${index}`;
}

/**
 * @param {unknown} origin
 * @returns {'sourced'|'suggested'|string}
 */
function normalizeOrigin(origin) {
  const o = String(origin ?? '').trim().toLowerCase();
  if (o === 'sourced' || o === 'research') return 'sourced';
  if (o === 'suggested' || o === 'generated' || o === 'ai') return 'suggested';
  return o || 'sourced';
}

/**
 * Deterministic hierarchy group only — never invent brand-specific buckets.
 * Weak evidence → null (projector falls back to "Services" / flat categories).
 * @param {Record<string, unknown>} item
 * @param {string} contentRole
 */
function deriveGroupKey(item, contentRole) {
  if (contentRole !== 'service_category' && contentRole !== 'service') return null;
  if (item.categoryGroup != null && String(item.categoryGroup).trim()) {
    return String(item.categoryGroup).trim();
  }
  if (item.parentName != null && String(item.parentName).trim()) {
    return String(item.parentName).trim();
  }
  if (item.parentId != null && String(item.parentId).trim()) {
    return `parent:${String(item.parentId).trim()}`;
  }
  return null;
}

/**
 * @param {ProjectionItem} item
 */
export function passesConfidenceThreshold(item) {
  if (!Number.isFinite(item.roleConfidence)) return true;
  return item.roleConfidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD;
}

/**
 * Mission 001 Gate 3 — sparse honest catalog when evidence is weak.
 * Prefer incomplete + truthful over complete + fabricated.
 */

import { buildCatalogGenerationProfile } from '../catalog/buildCatalogGenerationProfile.js';
import Mission001Flags from './mission001Flags.js';

/**
 * @param {object} mission001Meta
 * @param {object | null} research
 */
export function shouldUseSparseCatalogMode(mission001Meta = {}, research = null) {
  if (!Mission001Flags.sparseMode) return false;
  if (mission001Meta.sparseMode === true) return true;
  if (research?.researchRan && !research.fallbackToGenerated) {
    const items =
      research.extractedItems ??
      research.facts?.services ??
      research.facts?.products ??
      research.facts?.menuItems ??
      [];
    if (Array.isArray(items) && items.length > 0) return false;
    if (research.catalog?.products?.length) return false;
  }
  if (research?.fallbackToGenerated === true) return true;
  return mission001Meta.sparseMode === true;
}

/**
 * @param {object} params
 * @param {object} input
 * @param {object} [context]
 */
export function buildSparseHonestCatalog(params = {}, input = {}, context = {}) {
  const businessName = String(params.businessName ?? input?.businessName ?? 'Your business').trim();
  const catalogProfile = buildCatalogGenerationProfile({
    businessName,
    businessType: params.businessType ?? input?.businessType ?? input?.storeType,
    category: params.category ?? input?.category,
    description: params.description ?? input?.description,
    items: [],
  });

  return {
    profile: {
      name: businessName,
      type: params.businessType ?? input?.businessType ?? catalogProfile.businessType ?? null,
      verticalSlug: params.verticalSlug ?? input?.vertical ?? catalogProfile.verticalSlug ?? null,
    },
    categories: [],
    products: [],
    meta: {
      catalogSource: 'sparse_honest',
      mission001SparseMode: true,
      sparseReason: context.sparseReason ?? 'insufficient_evidence',
      aiGenerated: false,
      catalogMode: catalogProfile.catalogMode ?? 'services',
      catalogLabel: catalogProfile.catalogLabel ?? 'Services',
      primaryCTA: catalogProfile.primaryCTA ?? 'Contact us',
    },
  };
}

/**
 * Strip generic scaffold products from an existing catalog (repair path).
 * @param {object} catalog
 */
export function stripFabricatedCatalogScaffolds(catalog) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const kept = products.filter((p) => {
    const origin = String(p?.contentOrigin ?? p?.provenanceStatus ?? '').toLowerCase();
    if (origin === 'sourced' || origin === 'real' || p?.provenanceStatus === 'REAL') return true;
    const conf = Number(p?.confidence);
    if (Number.isFinite(conf) && conf >= 0.7) return true;
    const name = String(p?.name ?? '').toLowerCase();
    return !/\b(core service|premium package|basic package|express service|standard service)\b/.test(name);
  });
  if (kept.length === products.length) return catalog;
  return {
    ...catalog,
    products: kept,
    meta: {
      ...(catalog.meta ?? {}),
      mission001ScaffoldStripped: products.length - kept.length,
    },
  };
}

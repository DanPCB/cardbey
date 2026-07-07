/**
 * Build catalog + BSL profile from research extraction results.
 */

import { buildBusinessProfile } from '../businessSemantic/BusinessProfileBuilder.js';
import { buildCatalogFromPreloadedItems } from '../../services/draftStore/preloadedCatalogFromItems.js';
import { normalizeServiceCatalogItem, toServiceCatalogJson } from '../catalog/serviceCatalogNormalizer.js';
import { classifyBusinessKind } from './serviceMenuExtractor.js';
import { CONFIDENCE } from './types.js';

/**
 * @param {object} params
 * @param {import('./types.js').BusinessFacts} params.facts
 * @param {import('./types.js').ExtractedCatalogItem[]} params.items
 * @param {string} params.businessKind
 * @param {import('./types.js').StoreCreationResearchInput} params.input
 * @param {number} params.confidence
 */
export function buildResearchBackedStore(params) {
  const { facts, items, businessKind, input, confidence } = params;
  const businessName =
    facts.businessName?.value ?? input.businessName ?? 'Untitled Store';
  const description = facts.description?.value ?? null;

  const preloaded = items.map((item) => {
    const enriched = normalizeServiceCatalogItem(
      {
        name: item.name,
        title: item.name,
        description: item.description ?? null,
        price: item.price ?? null,
        category: item.category ?? defaultCategory(businessKind),
        itemType: businessKind === 'product_retail' ? 'product' : 'service',
        serviceMode: item.serviceMode,
        executionAction: item.executionAction,
        durationMinutes: item.durationMinutes ?? null,
      },
      {
        businessType: businessKind,
        businessName,
      },
    );
    return {
      name: enriched.name ?? item.name,
      description: enriched.description ?? item.description ?? '',
      price: item.price ?? null,
      category: item.category ?? defaultCategory(businessKind),
      kind: businessKind === 'product_retail' ? 'product' : 'service',
      serviceMode: enriched.serviceMode,
      executionAction: enriched.executionAction,
      serviceCatalog: toServiceCatalogJson(enriched),
      researchMeta: {
        sourceUrl: item.sourceUrl ?? null,
        sourceType: item.sourceType ?? null,
        confidence: item.confidence ?? confidence,
        needsOwnerReview: Boolean(item.needsOwnerReview),
        aiGenerated: false,
      },
    };
  });

  const catalog = buildCatalogFromPreloadedItems(preloaded, {
    businessName,
    businessType: businessKind,
    currencyCode: inferCurrency(input.location),
  });

  const profileResult = buildBusinessProfile({
    businessName,
    businessType: input.category ?? businessKind,
    description,
    items: preloaded.map((p) => ({
      name: p.name,
      itemType: p.kind,
      category: p.category,
      serviceMode: p.serviceMode,
      executionAction: p.executionAction,
    })),
    location: input.location ?? facts.address?.value ?? null,
  });

  catalog.meta = {
    ...(catalog.meta ?? {}),
    catalogSource: preloaded.length ? 'research' : 'ai_generated_fallback',
    researchConfidence: confidence,
    aiGenerated: !preloaded.length,
    ownerReviewRequired: confidence < CONFIDENCE.USE || preloaded.some((p) => p.researchMeta?.needsOwnerReview),
  };

  catalog.profile = {
    ...(catalog.profile ?? {}),
    name: businessName,
    tagline: description ?? businessName,
    businessProfile: profileResult.profile,
    phone: facts.phone?.value ?? input.phone ?? null,
    email: facts.email?.value ?? input.email ?? null,
    website: facts.website?.value ?? input.website ?? null,
    address: facts.address?.value ?? input.location ?? null,
    openingHours: facts.openingHours?.value ?? null,
    socialLinks: facts.socialLinks
      ? Object.fromEntries(Object.entries(facts.socialLinks).map(([k, v]) => [k, v.value]))
      : input.socialLinks ?? null,
  };

  return {
    catalog,
    businessProfile: profileResult.profile,
    businessKind: profileResult.profile.businessType ?? businessKind,
  };
}

function defaultCategory(businessKind) {
  if (businessKind === 'food_menu') return 'Menu';
  if (businessKind === 'product_retail') return 'Products';
  return 'Services';
}

function inferCurrency(location) {
  const loc = String(location ?? '').toLowerCase();
  if (/\baustralia\b|\bnsw\b|\bvic\b|\bqueensland\b|\bsydney\b|\bmelbourne\b/.test(loc)) return 'AUD';
  if (/\buk\b|\blondon\b|\bengland\b/.test(loc)) return 'GBP';
  if (/\busa\b|\bunited states\b|\bus\b/.test(loc)) return 'USD';
  return 'AUD';
}

export { classifyBusinessKind };

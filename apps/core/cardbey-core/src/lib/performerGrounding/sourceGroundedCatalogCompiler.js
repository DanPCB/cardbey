/**
 * Source-grounded catalog compiler — preserves evidence count and section order.
 */

import { randomUUID } from 'node:crypto';
import { matchMediaToItem } from './businessMediaMatcher.js';
import { resolveCatalog } from './businessSourceResolver.js';
import {
  EVIDENCE_STATUS,
  PROVENANCE_SOURCE,
  CATALOG_OPERATION,
} from './performerGroundingTypes.js';

function evidenceToProvenance(item) {
  const status = item.evidenceStatus ?? EVIDENCE_STATUS.INFERRED;
  /** @type {import('./performerGroundingTypes.js').ProvenanceSource} */
  let source = PROVENANCE_SOURCE.INFERRED_FROM_EVIDENCE;
  if (status === EVIDENCE_STATUS.EXACT) source = PROVENANCE_SOURCE.OWNER_PROVIDED;
  else if (status === EVIDENCE_STATUS.VERIFIED) source = PROVENANCE_SOURCE.VERIFIED_EXTERNAL;
  else if (status === EVIDENCE_STATUS.FALLBACK) source = PROVENANCE_SOURCE.CATEGORY_FALLBACK;

  return {
    source,
    sourceRefs: [item.sourceRef].filter(Boolean),
    confidence: Number(item.confidence) || 0.5,
    requiresOwnerReview: status === EVIDENCE_STATUS.INFERRED || status === EVIDENCE_STATUS.FALLBACK,
  };
}

function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * @param {import('./performerGroundingTypes.js').BusinessContentEvidence} evidence
 * @param {{
 *   operation?: import('./performerGroundingTypes.js').CatalogOperation;
 *   fallbackPolicy?: import('./performerGroundingTypes.js').FallbackPolicy;
 *   mediaPool?: import('./performerGroundingTypes.js').MediaEvidence[];
 * }} [opts]
 * @returns {import('./performerGroundingTypes.js').SourceGroundedCatalogDraft}
 */
export function compileSourceGroundedCatalog(evidence, opts = {}) {
  const operation = opts.operation ?? CATALOG_OPERATION.IMPORT;
  const fallbackPolicy = opts.fallbackPolicy;
  const mediaPool = [
    ...(opts.mediaPool ?? []),
    ...(evidence?.mediaEvidence?.productImages ?? []),
    ...(evidence?.mediaEvidence?.serviceImages ?? []),
  ];

  const { sections: sourceSections, total, conflicts } = resolveCatalog(evidence);
  const counts = { exact: 0, verified: 0, inferred: 0, fallback: 0, total: 0 };
  const missingContent = [];
  const seen = new Set();

  /** @type {import('./performerGroundingTypes.js').SourceGroundedCatalogDraft['sections']} */
  const sections = sourceSections.map((section) => {
    const items = (section.items ?? [])
      .slice()
      .sort((a, b) => (a.sourceOrder ?? 0) - (b.sourceOrder ?? 0))
      .map((item) => {
        const key = normalizeName(item.name).toLowerCase();
        if (!key || seen.has(key)) return null;
        seen.add(key);

        const provenance = evidenceToProvenance(item);
        const status = item.evidenceStatus ?? EVIDENCE_STATUS.INFERRED;
        if (status === EVIDENCE_STATUS.EXACT) counts.exact += 1;
        else if (status === EVIDENCE_STATUS.VERIFIED) counts.verified += 1;
        else if (status === EVIDENCE_STATUS.FALLBACK) counts.fallback += 1;
        else counts.inferred += 1;
        counts.total += 1;

        const mediaMatch = matchMediaToItem({
          item: { name: item.name, description: item.description, category: section.sectionName, itemType: item.itemType },
          availableMedia: mediaPool,
          fallbackPolicy,
        });

        if (!mediaMatch.mediaUrl) missingContent.push(`no_image:${item.name}`);

        return {
          id: item.sourceItemId || `item_${randomUUID().slice(0, 8)}`,
          itemType: item.itemType,
          name: normalizeName(item.name),
          description: item.description ?? undefined,
          price: item.price ?? undefined,
          currency: item.currency ?? undefined,
          durationMinutes: item.durationMinutes ?? undefined,
          provenance,
          sourceOrder: item.sourceOrder,
          sourceSection: section.sectionName,
          ...(mediaMatch.mediaUrl
            ? {
                image: {
                  url: mediaMatch.mediaUrl,
                  matchScore: mediaMatch.score,
                  provenance: mediaMatch.provenance,
                },
              }
            : {}),
        };
      })
      .filter(Boolean);

    return {
      title: section.sectionName,
      sourceOrder: section.sourceOrder,
      items,
    };
  }).filter((s) => s.items.length > 0);

  if (operation === CATALOG_OPERATION.IMPORT && fallbackPolicy?.allowGeneratedItems !== true) {
    // Never pad catalog during import.
  }

  const catalogType = evidence?.catalogEvidence?.detectedCatalogType ?? 'MIXED';
  const resolvedType = catalogType === 'UNKNOWN' ? 'MIXED' : catalogType;

  return {
    catalogType: /** @type {import('./performerGroundingTypes.js').SourceGroundedCatalogDraft['catalogType']} */ (resolvedType),
    sections,
    counts,
    sourceCoverage: evidence?.catalogEvidence?.sourceCoverage ?? (total > 0 ? 1 : 0),
    overallConfidence: evidence?.catalogEvidence?.confidence ?? evidence?.businessIdentity?.sourceConfidence ?? 0,
    missingContent: [
      ...missingContent,
      ...conflicts.map((c) => `conflict:${c.fieldPath}`),
      ...(Array.isArray(evidence?.unresolvedFields) ? evidence.unresolvedFields : []),
    ],
  };
}

/**
 * Convert grounded draft to legacy catalog build shape (for persistence).
 * @param {import('./performerGroundingTypes.js').SourceGroundedCatalogDraft} draft
 * @param {{ businessName?: string; currencyCode?: string }} [ctx]
 */
export function groundedCatalogDraftToLegacyCatalog(draft, ctx = {}) {
  const categories = [];
  const products = [];
  let catIdx = 0;

  for (const section of draft.sections ?? []) {
    const catId = `ground_cat_${catIdx++}`;
    categories.push({ id: catId, name: section.title, sourceOrder: section.sourceOrder });
    for (const item of section.items ?? []) {
      products.push({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        price: item.price ?? null,
        currencyCode: item.currency ?? ctx.currencyCode ?? 'AUD',
        categoryId: catId,
        category: section.title,
        kind: item.itemType === 'PRODUCT' ? 'product' : 'service',
        itemType: item.itemType === 'PRODUCT' ? 'product' : 'service',
        durationMinutes: item.durationMinutes ?? null,
        imageUrl: item.image?.url ?? null,
        provenance: item.provenance,
        sourceOrder: item.sourceOrder,
        evidenceStatus: item.provenance.source,
        requiresOwnerReview: item.provenance.requiresOwnerReview,
      });
    }
  }

  return {
    profile: {
      name: ctx.businessName ?? undefined,
      tagline: ctx.businessName ?? undefined,
    },
    categories,
    products,
    meta: {
      catalogSource: 'source_grounded',
      evidenceAuthoritative: true,
      canonicalItemCount: draft.counts.total,
      displayPageSize: null,
      provenanceSummary: draft.counts,
      sourceCoverage: draft.sourceCoverage,
      overallConfidence: draft.overallConfidence,
      missingContent: draft.missingContent,
    },
  };
}

export const SourceGroundedCatalogCompiler = {
  compile: compileSourceGroundedCatalog,
  toLegacyCatalog: groundedCatalogDraftToLegacyCatalog,
};

export default SourceGroundedCatalogCompiler;

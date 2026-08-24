/**
 * Mission 001 Gate 1 — connect PerformerGroundingEngine to research catalog output.
 */

import { buildBusinessContentEvidenceFromResearch } from '../performerGrounding/adapters/storeGroundingAdapter.js';
import { runPerformerGrounding } from '../performerGrounding/performerGroundingEngine.js';
import { resolveStoreResearchInputFields } from '../storeCreationResearch/researchInputFields.js';
import Mission001Flags from './mission001Flags.js';
import { attachNormalizedProvenanceToCatalog } from './provenanceNormalize.js';

/**
 * @param {object} research
 * @returns {object[]}
 */
export function extractResearchCatalogItems(research) {
  if (!research || typeof research !== 'object') return [];
  if (Array.isArray(research.extractedItems) && research.extractedItems.length) {
    return research.extractedItems;
  }
  const facts = research.facts;
  if (!facts || typeof facts !== 'object') return [];
  const merged = [
    ...(Array.isArray(facts.services) ? facts.services : []),
    ...(Array.isArray(facts.menuItems) ? facts.menuItems : []),
    ...(Array.isArray(facts.products) ? facts.products : []),
  ];
  return merged.filter(Boolean);
}

/**
 * @param {object} research
 * @param {object} params
 * @param {object} input
 * @param {{ missionId?: string | null, draftId?: string | null }} [scope]
 */
export function buildGroundedCatalogFromResearch(research, params, input, scope = {}) {
  if (!Mission001Flags.groundingConnected) return null;
  if (!research?.researchRan) return null;

  const items = extractResearchCatalogItems(research);
  if (!items.length && !research.facts) return null;

  const fields = resolveStoreResearchInputFields(params, input);
  const evidence = buildBusinessContentEvidenceFromResearch({
    facts: research.facts,
    items,
    input: fields,
    businessKind: research.businessKind ?? research.businessProfile?.businessType ?? fields.category,
    confidence: Number(research.confidence) || 0.5,
  });

  const grounded = runPerformerGrounding({
    intent: { family: 'STORE_CREATION' },
    intentFamily: 'store_creation',
    evidence,
    missionId: scope.missionId ?? fields.missionId ?? null,
    storeId: scope.draftId ?? fields.draftId ?? null,
  });

  const products = grounded.legacyCatalog?.products;
  if (!Array.isArray(products) || products.length === 0) return null;

  let catalog = {
    ...grounded.legacyCatalog,
    meta: {
      ...(grounded.legacyCatalog.meta ?? {}),
      catalogSource: 'source_grounded',
      mission001Grounding: true,
      researchConfidence: research.confidence ?? null,
      fidelityScore: grounded.fidelity ?? null,
      provenanceSummary: grounded.provenanceSummary ?? null,
    },
  };

  if (Mission001Flags.provenancePreserve) {
    catalog = attachNormalizedProvenanceToCatalog(catalog);
  }

  return { catalog, grounded, evidence };
}

/**
 * Prefer evidence-grounded catalog when it carries verified/exact items.
 * @param {ReturnType<typeof buildGroundedCatalogFromResearch>} groundedResult
 * @param {object | null} researchCatalog
 */
export function preferGroundedCatalog(groundedResult, researchCatalog) {
  if (!groundedResult?.catalog) return researchCatalog;
  if (!researchCatalog?.products?.length) return groundedResult.catalog;

  const summary = groundedResult.grounded?.provenanceSummary ?? {};
  const evidenceBacked = (summary.exact ?? 0) + (summary.verified ?? 0);
  if (evidenceBacked > 0) return groundedResult.catalog;

  const researchMeta = researchCatalog.meta?.catalogSource;
  if (researchMeta === 'research' && researchCatalog.products.length >= groundedResult.catalog.products.length) {
    return researchCatalog;
  }
  return groundedResult.catalog;
}

/**
 * Material difference check for Gate 1 tests — grounded names should not match generic scaffold set.
 * @param {object} catalog
 * @param {string[]} genericNames
 */
export function catalogDiffersFromGenericScaffold(catalog, genericNames) {
  const names = (catalog?.products ?? []).map((p) => String(p?.name ?? '').trim().toLowerCase()).filter(Boolean);
  if (!names.length) return false;
  const generic = new Set(genericNames.map((n) => n.toLowerCase()));
  const overlap = names.filter((n) => generic.has(n)).length;
  return overlap / names.length < 0.5;
}

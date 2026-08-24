/**
 * Store grounding adapter — bridges research/store facts → BusinessContentEvidence.
 */

import { EVIDENCE_STATUS } from '../performerGroundingTypes.js';

function pickString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function mapTrust(sourceType) {
  const t = String(sourceType ?? '').toLowerCase();
  if (t.includes('owner') || t === 'manual' || t === 'uploaded_document') return 'OWNER_VERIFIED';
  if (t.includes('official') || t === 'website') return 'OFFICIAL';
  if (t.includes('booking') || t.includes('google')) return 'HIGH';
  if (t.includes('directory') || t.includes('review')) return 'MEDIUM';
  return 'LOW';
}

function mapItemType(businessKind, item) {
  if (item?.itemType === 'product' || item?.kind === 'product' || businessKind === 'product_retail') return 'PRODUCT';
  if (businessKind === 'food_menu') return 'MENU_ITEM';
  return 'SERVICE';
}

function mapEvidenceStatus(item) {
  if (item?.aiGenerated) return EVIDENCE_STATUS.FALLBACK;
  if (item?.needsOwnerReview) return EVIDENCE_STATUS.INFERRED;
  const conf = Number(item?.confidence ?? item?.researchMeta?.confidence);
  if (conf >= 0.75) return EVIDENCE_STATUS.VERIFIED;
  if (conf >= 0.55) return EVIDENCE_STATUS.INFERRED;
  return EVIDENCE_STATUS.EXACT;
}

/**
 * @param {object} params
 * @param {import('../../storeCreationResearch/types.js').BusinessFacts} [params.facts]
 * @param {import('../../storeCreationResearch/types.js').ExtractedCatalogItem[]} [params.items]
 * @param {import('../../storeCreationResearch/types.js').StoreCreationResearchInput} [params.input]
 * @param {string} [params.businessKind]
 * @param {number} [params.confidence]
 */
export function buildBusinessContentEvidenceFromResearch(params) {
  const { facts, items = [], input = {}, businessKind = 'services', confidence = 0.5 } = params;
  const businessName = pickString(facts?.businessName?.value, input.businessName, 'Untitled Store');

  const sectionMap = new Map();
  let order = 0;
  for (const item of items) {
    const sectionName = pickString(item.category, defaultSection(businessKind));
    if (!sectionMap.has(sectionName)) {
      sectionMap.set(sectionName, { sectionName, sourceOrder: order++, items: [] });
    }
    const section = sectionMap.get(sectionName);
    const evidenceStatus = mapEvidenceStatus(item);
    section.items.push({
      sourceItemId: `src_${section.items.length}_${sectionName.replace(/\s+/g, '_').toLowerCase()}`,
      sourceSection: sectionName,
      sourceOrder: section.items.length,
      name: item.name,
      description: item.description ?? undefined,
      price: item.price ?? undefined,
      currency: item.currency ?? undefined,
      durationMinutes: item.durationMinutes ?? undefined,
      itemType: mapItemType(businessKind, item),
      sourceRef: pickString(item.sourceUrl, item.sourceType, 'research'),
      confidence: Number(item.confidence) || confidence,
      evidenceStatus,
    });
  }

  const sections = [...sectionMap.values()].sort((a, b) => a.sourceOrder - b.sourceOrder);
  const totalDetectedItems = sections.reduce((n, s) => n + s.items.length, 0);

  const sourceDocuments = [];
  if (facts?.sourceEvidence?.length) {
    for (const [idx, ev] of facts.sourceEvidence.entries()) {
      sourceDocuments.push({
        sourceId: `doc_${idx}`,
        sourceType: mapDocType(ev?.sourceType),
        sourceUrl: ev?.sourceUrl ?? undefined,
        capturedAt: new Date().toISOString(),
        trustLevel: mapTrust(ev?.sourceType),
        extractedFields: { valueSummary: ev?.value },
      });
    }
  }

  return {
    businessIdentity: {
      canonicalName: businessName,
      tradingName: businessName,
      category: pickString(facts?.category?.value, input.category),
      description: pickString(facts?.description?.value, input.description),
      address: pickString(facts?.address?.value, input.location),
      phone: pickString(facts?.phone?.value, input.phone),
      website: pickString(facts?.website?.value, input.website),
      socialLinks: facts?.socialLinks
        ? Object.values(facts.socialLinks).map((v) => v?.value).filter(Boolean)
        : [],
      sourceConfidence: confidence,
    },
    sourceDocuments,
    catalogEvidence: {
      detectedCatalogType: detectCatalogType(businessKind, sections),
      sections,
      totalDetectedItems,
      sourceCoverage: totalDetectedItems > 0 ? 1 : 0,
      confidence,
    },
    mediaEvidence: {
      logos: facts?.images?.length
        ? facts.images.map((img, i) => ({ url: img.value, sourceId: `logo_${i}`, trustLevel: mapTrust(img.sourceType) }))
        : [],
      heroCandidates: [],
      productImages: [],
      serviceImages: [],
      videos: [],
    },
    unresolvedFields: totalDetectedItems === 0 ? ['catalog_items'] : [],
    conflicts: [],
  };
}

function defaultSection(businessKind) {
  if (businessKind === 'food_menu') return 'Menu';
  if (businessKind === 'product_retail') return 'Products';
  return 'Services';
}

function detectCatalogType(businessKind, sections) {
  if (businessKind === 'food_menu') return 'MENU';
  if (businessKind === 'product_retail') return 'PRODUCTS';
  const types = new Set(sections.flatMap((s) => s.items.map((i) => i.itemType)));
  if (types.size > 1) return 'MIXED';
  if (types.has('PRODUCT')) return 'PRODUCTS';
  if (types.has('MENU_ITEM')) return 'MENU';
  return 'SERVICES';
}

function mapDocType(sourceType) {
  const t = String(sourceType ?? '').toLowerCase();
  if (t.includes('menu')) return 'MENU';
  if (t.includes('website')) return 'WEBSITE';
  if (t.includes('upload')) return 'PDF';
  if (t.includes('manual') || t.includes('owner')) return 'OWNER_INPUT';
  return 'OTHER';
}

/**
 * @param {object} params
 */
export function buildStoreCreationMissionContractGrounded(params) {
  const {
    ownerUserId,
    evidence,
    groundedResult,
    sourceSnapshotId,
    generatedDraft,
  } = params;

  return {
    family: 'STORE_CREATION',
    ownerUserId,
    businessIdentity: evidence?.businessIdentity,
    catalogEvidence: evidence?.catalogEvidence,
    mediaEvidence: evidence?.mediaEvidence,
    sourceSnapshotId,
    generatedDraft,
    provenanceSummary: groundedResult?.provenanceSummary ?? {
      exactCount: 0,
      verifiedCount: 0,
      inferredCount: 0,
      fallbackCount: 0,
    },
    fidelityScore: groundedResult?.fidelity ?? null,
    ownerReviewRequired: Boolean(groundedResult?.requiresOwnerReview),
    frozenAt: null,
  };
}

export const StoreGroundingAdapter = {
  buildEvidenceFromResearch: buildBusinessContentEvidenceFromResearch,
  buildMissionContract: buildStoreCreationMissionContractGrounded,
};

export default StoreGroundingAdapter;

/**
 * Phase 4 — Evidence reconciliation with field-level provenance.
 * Wraps researchEvidence merge; never overwrites higher authority with lower.
 */

import { randomUUID } from 'node:crypto';
import { mergeEvidence } from '../researchEvidence/evidenceMerger.js';
import { EVIDENCE_TIERS } from '../researchEvidence/evidenceTiers.js';

/** @typedef {import('./types.js').BusinessEvidence} BusinessEvidence */
/** @typedef {import('./types.js').EvidenceField} EvidenceField */
/** @typedef {import('./types.js').ProvenanceRef} ProvenanceRef */

const AUTHORITY_RANK = {
  owner_controlled: 0,
  authoritative_structured: 1,
  supporting_public: 2,
  unverified: 3,
};

/**
 * @param {number} tier
 * @returns {import('./types.js').SourceAuthority}
 */
function tierToAuthority(tier) {
  if (tier <= EVIDENCE_TIERS.BUSINESS_DOCUMENT) return 'owner_controlled';
  if (tier <= EVIDENCE_TIERS.OFFICIAL_API) return 'authoritative_structured';
  if (tier <= EVIDENCE_TIERS.STRUCTURED_WEB) return 'authoritative_structured';
  if (tier <= EVIDENCE_TIERS.DIRECTORY) return 'supporting_public';
  return 'unverified';
}

/**
 * @param {object} row
 * @returns {ProvenanceRef}
 */
function rowToProvenance(row) {
  const fetchedAt = new Date().toISOString();
  return {
    sourceId: String(row.evidenceId ?? row.providerId ?? randomUUID()),
    sourceType: String(row.sourceType ?? row.providerId ?? 'unknown'),
    sourceUrl: row.sourceUrl ?? null,
    authority: tierToAuthority(row.tier ?? EVIDENCE_TIERS.AI_SUGGESTION),
    fetchedAt,
  };
}

/**
 * @param {unknown} value
 * @param {object} mergedRow
 * @param {string} fieldPath
 * @returns {EvidenceField}
 */
function toEvidenceField(value, mergedRow, fieldPath) {
  const fetchedAt = new Date().toISOString();
  const conflict = Boolean(mergedRow?.conflict);
  const isSuggested = mergedRow?.tier >= EVIDENCE_TIERS.AI_SUGGESTION;
  return {
    value,
    confidence: typeof mergedRow?.confidence === 'number' ? mergedRow.confidence : 0.5,
    status: conflict ? 'conflict' : isSuggested ? 'suggested' : 'confirmed',
    contentOrigin: isSuggested ? 'suggested' : 'sourced',
    sources: [rowToProvenance(mergedRow ?? { providerId: fieldPath })],
    fetchedAt,
    conflictingValues: Array.isArray(mergedRow?.conflictingValues)
      ? mergedRow.conflictingValues.map((c) => ({
          value: c.value,
          confidence: c.confidence ?? 0,
          sources: [],
        }))
      : undefined,
  };
}

/**
 * Reconcile provider results into BusinessEvidence.
 * @param {object} params
 * @param {object[]} params.providerResults
 * @param {string} [params.entityId]
 * @param {object[]} [params.suggestedCatalogItems]
 */
export function reconcileBusinessEvidence({ providerResults = [], entityId = null, suggestedCatalogItems = [] }) {
  const merged = mergeEvidence(providerResults);
  const evidenceId = randomUUID();
  const fetchedAt = new Date().toISOString();

  /** @type {Record<string, EvidenceField>} */
  const profile = {};
  for (const [fieldPath, row] of Object.entries(merged.mergedFacts ?? {})) {
    profile[fieldPath] = toEvidenceField(row.value, row, fieldPath);
  }

  const sourcedCatalog = (merged.catalogItems ?? []).map((item, index) => ({
    id: item.id ?? `cat_${index}`,
    name: String(item.name ?? '').trim(),
    description: item.description ?? null,
    price: typeof item.price === 'number' ? item.price : null,
    currency: item.currency ?? null,
    category: item.category ?? null,
    contentOrigin: item.tier >= EVIDENCE_TIERS.AI_SUGGESTION ? 'suggested' : 'sourced',
    confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
    status: item.conflict ? 'conflict' : 'confirmed',
    sources: [
      {
        sourceId: item.providerId ?? `catalog_${index}`,
        sourceType: item.sourceType ?? item.providerId ?? 'unknown',
        sourceUrl: item.sourceUrl ?? null,
        authority: tierToAuthority(item.tier ?? EVIDENCE_TIERS.DIRECTORY),
        fetchedAt,
      },
    ],
    imageRightsWarning: Boolean(item.imageUrl && !item.imageLicensed),
  }));

  const suggestedItems = (suggestedCatalogItems ?? []).map((item, index) => ({
    id: item.id ?? `sug_${index}`,
    name: String(item.name ?? '').trim(),
    description: item.description ?? null,
    price: typeof item.price === 'number' ? item.price : null,
    currency: item.currency ?? null,
    category: item.category ?? null,
    contentOrigin: 'suggested',
    confidence: typeof item.confidence === 'number' ? item.confidence : 0.35,
    status: 'suggested',
    sources: [],
  }));

  const imageRightsWarnings = sourcedCatalog
    .filter((i) => i.imageRightsWarning)
    .map((i) => `Image for "${i.name}" may require owner approval before publish.`);

  /** @type {BusinessEvidence} */
  const evidence = {
    evidenceId,
    entityId,
    profile,
    catalogItems: sourcedCatalog,
    conflicts: merged.conflicts ?? [],
    imageRightsWarnings,
    confidence: merged.confidenceSummary?.overall ?? 0,
  };

  return { evidence, suggestedItems, merged };
}

/**
 * Merge higher-authority field without downgrade.
 * @param {EvidenceField|undefined} existing
 * @param {EvidenceField} incoming
 */
export function mergeEvidenceField(existing, incoming) {
  if (!existing) return incoming;
  const existingRank = AUTHORITY_RANK[existing.sources[0]?.authority ?? 'unverified'];
  const incomingRank = AUTHORITY_RANK[incoming.sources[0]?.authority ?? 'unverified'];
  if (incomingRank > existingRank) return existing;
  if (incomingRank < existingRank) return incoming;
  return (incoming.confidence ?? 0) >= (existing.confidence ?? 0) ? incoming : existing;
}

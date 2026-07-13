/**
 * Source priority policy and conflict resolution.
 */

import { scoreBusinessIdentityMatch, identityMatchAllowsImport } from './businessIdentityMatcher.js';
import { PROVENANCE_SOURCE } from './performerGroundingTypes.js';

const SOURCE_PRIORITY = {
  OWNER_INPUT: 100,
  uploaded_document: 95,
  BUSINESS_CARD: 95,
  MENU: 90,
  SERVICE_LIST: 90,
  PRICE_LIST: 88,
  PDF: 88,
  IMAGE: 85,
  official_website: 85,
  WEBSITE: 85,
  OFFICIAL: 82,
  booking_platform: 75,
  SOCIAL_PROFILE: 70,
  facebook: 68,
  instagram: 68,
  DIRECTORY: 60,
  google_business: 58,
  review_site: 50,
  OTHER: 40,
};

function trustRank(level) {
  const map = { OWNER_VERIFIED: 5, OFFICIAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return map[level] ?? 1;
}

function pickString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * @param {string} sourceType
 */
export function sourcePriority(sourceType) {
  const key = String(sourceType ?? '').trim();
  return SOURCE_PRIORITY[key] ?? SOURCE_PRIORITY.OTHER;
}

/**
 * @param {import('./performerGroundingTypes.js').BusinessContentEvidence} evidence
 * @param {import('./performerGroundingTypes.js').SourcePolicy} [policy]
 */
export function resolveIdentity(evidence, policy) {
  const identity = evidence?.businessIdentity ?? {};
  const docs = Array.isArray(evidence?.sourceDocuments) ? evidence.sourceDocuments : [];
  const ranked = [...docs].sort(
    (a, b) => sourcePriority(b.sourceType) - sourcePriority(a.sourceType) || trustRank(b.trustLevel) - trustRank(a.trustLevel),
  );
  const resolved = { ...identity };
  const conflicts = [];

  for (const doc of ranked) {
    const fields = doc.extractedFields ?? {};
    for (const [key, value] of Object.entries(fields)) {
      if (value == null || value === '') continue;
      const existing = resolved[key];
      if (existing == null || existing === '') {
        resolved[key] = value;
      } else if (String(existing) !== String(value)) {
        conflicts.push({
          fieldPath: `businessIdentity.${key}`,
          sourceIds: [doc.sourceId],
          values: [existing, value],
          message: `Conflicting ${key} across sources`,
        });
      }
    }
  }

  return { identity: resolved, conflicts, topSource: ranked[0] ?? null };
}

/**
 * @param {import('./performerGroundingTypes.js').BusinessContentEvidence} evidence
 */
export function resolveCatalog(evidence) {
  const catalog = evidence?.catalogEvidence;
  if (!catalog) return { sections: [], total: 0, conflicts: [] };
  const sections = Array.isArray(catalog.sections) ? catalog.sections : [];
  const sortedSections = [...sections].sort((a, b) => a.sourceOrder - b.sourceOrder);
  const conflicts = [];
  const seen = new Map();

  for (const section of sortedSections) {
    for (const item of section.items ?? []) {
      const key = String(item.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const prior = seen.get(key);
      if (!prior) {
        seen.set(key, item);
        continue;
      }
      if (prior.price != null && item.price != null && Number(prior.price) !== Number(item.price)) {
        conflicts.push({
          fieldPath: `catalog.${key}.price`,
          sourceIds: [prior.sourceRef, item.sourceRef],
          values: [prior.price, item.price],
          message: `Price conflict for ${item.name}`,
        });
      }
    }
  }

  return {
    sections: sortedSections,
    total: catalog.totalDetectedItems ?? sortedSections.reduce((n, s) => n + (s.items?.length ?? 0), 0),
    conflicts,
  };
}

/**
 * @param {object} targetIdentity
 * @param {object} sourceCandidate
 * @param {import('./performerGroundingTypes.js').SourcePolicy} [policy]
 */
export function shouldAcceptExternalSource(targetIdentity, sourceCandidate, policy) {
  const match = scoreBusinessIdentityMatch(targetIdentity, sourceCandidate);
  if (!identityMatchAllowsImport(match, policy)) {
    return { accept: false, match, provenance: null };
  }
  const provenanceSource =
    match.status === 'EXACT_MATCH'
      ? PROVENANCE_SOURCE.VERIFIED_EXTERNAL
      : PROVENANCE_SOURCE.INFERRED_FROM_EVIDENCE;
  return {
    accept: true,
    match,
    provenance: {
      source: provenanceSource,
      sourceRefs: [pickString(sourceCandidate.sourceId, sourceCandidate.sourceUrl)],
      confidence: match.score,
      requiresOwnerReview: match.status !== 'EXACT_MATCH',
    },
  };
}

/**
 * @param {import('./performerGroundingTypes.js').BusinessEvidenceConflict[]} conflicts
 */
export function resolveConflicts(conflicts) {
  const unresolved = Array.isArray(conflicts) ? conflicts : [];
  return {
    requiresOwnerReview: unresolved.length > 0,
    conflictCount: unresolved.length,
    conflicts: unresolved,
  };
}

export const BusinessSourceResolver = {
  resolveIdentity,
  resolveCatalog,
  resolveConflicts,
  shouldAcceptExternalSource,
  sourcePriority,
};

export default BusinessSourceResolver;

/**
 * Shared Research Evidence Layer contracts for internal provider compatibility.
 * V1 keeps legacy storeCreationResearch behavior intact while attaching
 * normalized evidence and BusinessKnowledgeGraph snapshots.
 */

/**
 * @typedef {'pending'|'accepted'|'edited'|'rejected'|'needs_owner_review'} OwnerVerifiedStatus
 */

/**
 * @typedef {'internet_research'|'uploaded_document'|'manual_input'|'ai_generated'} ResearchSourceKind
 */

/**
 * @typedef {Object} IdentityMatch
 * @property {boolean} matched
 * @property {number} confidence
 * @property {string[]} reasons
 * @property {string[]} matchedFields
 */

/**
 * @typedef {Object} SourceEvidence
 * @property {string} id
 * @property {string} providerId
 * @property {number} tier
 * @property {string|null} sourceUrl
 * @property {ResearchSourceKind} sourceType
 * @property {string} fieldPath
 * @property {string} valueSummary
 * @property {number} confidence
 * @property {string} fetchedAt
 * @property {OwnerVerifiedStatus} ownerVerifiedStatus
 */

/**
 * @typedef {Object} ResearchProviderResult
 * @property {string} providerId
 * @property {string} providerName
 * @property {number} tier
 * @property {ResearchSourceKind} sourceType
 * @property {string|null} sourceUrl
 * @property {string} fetchedAt
 * @property {number} confidence
 * @property {IdentityMatch} identityMatch
 * @property {Record<string, unknown>} businessFacts
 * @property {Array<Record<string, unknown>>} catalogItems
 * @property {Array<Record<string, unknown>>} mediaAssets
 * @property {Array<Record<string, unknown>>} reviews
 * @property {Record<string, unknown>} policies
 * @property {string} rawEvidenceSummary
 * @property {SourceEvidence[]} sourceEvidence
 * @property {Array<string|Record<string, unknown>>} errors
 */

/**
 * @typedef {Object} KnowledgeGraphNodeMeta
 * @property {string[]} sourceEvidenceIds
 * @property {number} confidence
 * @property {number} tier
 * @property {OwnerVerifiedStatus} ownerVerifiedStatus
 * @property {string} lastUpdatedAt
 * @property {boolean} [conflict]
 * @property {string[]} [conflictEvidenceIds]
 * @property {string[]} [providerIds]
 */

export const OWNER_VERIFIED_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EDITED: 'edited',
  REJECTED: 'rejected',
  NEEDS_OWNER_REVIEW: 'needs_owner_review',
};

export const SOURCE_KIND = {
  INTERNET_RESEARCH: 'internet_research',
  UPLOADED_DOCUMENT: 'uploaded_document',
  MANUAL_INPUT: 'manual_input',
  AI_GENERATED: 'ai_generated',
};

/**
 * @param {Partial<IdentityMatch>} [input]
 * @returns {IdentityMatch}
 */
export function createIdentityMatch(input = {}) {
  return {
    matched: input.matched === true,
    confidence: typeof input.confidence === 'number' ? input.confidence : 0,
    reasons: Array.isArray(input.reasons) ? input.reasons.filter(Boolean) : [],
    matchedFields: Array.isArray(input.matchedFields) ? input.matchedFields.filter(Boolean) : [],
  };
}

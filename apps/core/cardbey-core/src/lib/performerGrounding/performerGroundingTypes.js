/**
 * Canonical Performer source-grounding contracts.
 * @module performerGrounding/types
 */

/** @typedef {'OWNER_PROVIDED'|'OFFICIAL_SOURCE'|'VERIFIED_EXTERNAL'|'INFERRED_FROM_EVIDENCE'|'CATEGORY_FALLBACK'|'AI_GENERATED'} ProvenanceSource */

/** @typedef {'EXACT'|'VERIFIED'|'INFERRED'|'FALLBACK'} EvidenceStatus */

/** @typedef {'PRODUCT'|'SERVICE'|'MENU_ITEM'} CatalogItemType */

/** @typedef {'PRODUCTS'|'SERVICES'|'MENU'|'MIXED'|'UNKNOWN'} DetectedCatalogType */

/** @typedef {'OWNER_VERIFIED'|'OFFICIAL'|'HIGH'|'MEDIUM'|'LOW'} TrustLevel */

/** @typedef {'BUSINESS_CARD'|'MENU'|'SERVICE_LIST'|'PRICE_LIST'|'WEBSITE'|'SOCIAL_PROFILE'|'DIRECTORY'|'OWNER_INPUT'|'IMAGE'|'PDF'|'OTHER'} SourceDocumentType */

/**
 * @typedef {Object} ContentProvenance
 * @property {ProvenanceSource} source
 * @property {string[]} sourceRefs
 * @property {number} confidence
 * @property {string} [generatedAt]
 * @property {boolean} requiresOwnerReview
 */

/**
 * @typedef {Object} BusinessEvidenceConflict
 * @property {string} fieldPath
 * @property {string[]} sourceIds
 * @property {unknown[]} values
 * @property {string} [message]
 */

/**
 * @typedef {Object} MediaEvidence
 * @property {string} url
 * @property {string} [sourceId]
 * @property {TrustLevel} [trustLevel]
 * @property {number} [confidence]
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} BusinessCatalogItemEvidence
 * @property {string} sourceItemId
 * @property {string} [sourceSection]
 * @property {number} [sourceOrder]
 * @property {string} name
 * @property {string} [description]
 * @property {number} [price]
 * @property {string} [currency]
 * @property {number} [durationMinutes]
 * @property {string[]} [variants]
 * @property {CatalogItemType} itemType
 * @property {string} sourceRef
 * @property {number} confidence
 * @property {EvidenceStatus} evidenceStatus
 */

/**
 * @typedef {Object} BusinessCatalogSectionEvidence
 * @property {string} sectionName
 * @property {number} sourceOrder
 * @property {BusinessCatalogItemEvidence[]} items
 */

/**
 * @typedef {Object} BusinessContentEvidence
 * @property {Object} businessIdentity
 * @property {string} [businessIdentity.canonicalName]
 * @property {string} [businessIdentity.tradingName]
 * @property {string} [businessIdentity.category]
 * @property {string} [businessIdentity.subcategory]
 * @property {string} [businessIdentity.description]
 * @property {string} [businessIdentity.address]
 * @property {string} [businessIdentity.phone]
 * @property {string} [businessIdentity.website]
 * @property {string[]} [businessIdentity.socialLinks]
 * @property {string} [businessIdentity.logoUrl]
 * @property {string[]} [businessIdentity.brandColors]
 * @property {number} businessIdentity.sourceConfidence
 * @property {Array<{ sourceId: string; sourceType: SourceDocumentType; sourceUrl?: string; assetRef?: string; capturedAt: string; trustLevel: TrustLevel; extractedFields: Record<string, unknown> }>} sourceDocuments
 * @property {Object} catalogEvidence
 * @property {DetectedCatalogType} catalogEvidence.detectedCatalogType
 * @property {BusinessCatalogSectionEvidence[]} catalogEvidence.sections
 * @property {number} catalogEvidence.totalDetectedItems
 * @property {number} catalogEvidence.sourceCoverage
 * @property {number} catalogEvidence.confidence
 * @property {Object} mediaEvidence
 * @property {MediaEvidence[]} mediaEvidence.logos
 * @property {MediaEvidence[]} mediaEvidence.heroCandidates
 * @property {MediaEvidence[]} mediaEvidence.productImages
 * @property {MediaEvidence[]} mediaEvidence.serviceImages
 * @property {MediaEvidence[]} mediaEvidence.videos
 * @property {string[]} unresolvedFields
 * @property {BusinessEvidenceConflict[]} conflicts
 */

/**
 * @typedef {Object} SourceGroundedCatalogDraftItem
 * @property {string} id
 * @property {CatalogItemType} itemType
 * @property {string} name
 * @property {string} [description]
 * @property {number} [price]
 * @property {string} [currency]
 * @property {number} [durationMinutes]
 * @property {{ url: string; matchScore: number; provenance: ContentProvenance }} [image]
 * @property {ContentProvenance} provenance
 * @property {number} [sourceOrder]
 * @property {string} [sourceSection]
 */

/**
 * @typedef {Object} SourceGroundedCatalogDraft
 * @property {Exclude<DetectedCatalogType, 'UNKNOWN'>} catalogType
 * @property {Array<{ title: string; sourceOrder: number; items: SourceGroundedCatalogDraftItem[] }>} sections
 * @property {{ exact: number; verified: number; inferred: number; fallback: number; total: number }} counts
 * @property {number} sourceCoverage
 * @property {number} overallConfidence
 * @property {string[]} missingContent
 */

/**
 * @typedef {Object} FallbackPolicy
 * @property {boolean} allowGeneratedDescriptions
 * @property {boolean} allowCategoryImages
 * @property {boolean} allowGeneratedItems
 * @property {number} maxGeneratedItemCount
 * @property {boolean} requireOwnerApprovalForGeneratedItems
 */

/**
 * @typedef {Object} SourcePolicy
 * @property {number} minTrustScore
 * @property {boolean} requireIdentityMatch
 * @property {import('./businessIdentityMatcher.js').IdentityMatchStatus} [minIdentityMatch]
 */

/**
 * @typedef {Object} GroundedGenerationRequest
 * @template TIntent
 * @property {TIntent} intent
 * @property {string} evidenceSnapshotId
 * @property {SourcePolicy} sourcePolicy
 * @property {FallbackPolicy} fallbackPolicy
 * @property {boolean} ownerReviewRequired
 */

/**
 * @typedef {Object} GroundedGenerationResult
 * @template T
 * @property {T} output
 * @property {{ exactCount: number; verifiedCount: number; inferredCount: number; fallbackCount: number }} provenanceSummary
 * @property {number} confidence
 * @property {BusinessEvidenceConflict[]} conflicts
 * @property {string[]} missingFields
 * @property {boolean} requiresOwnerReview
 */

/**
 * @typedef {Object} BusinessFidelityScore
 * @property {number} overall
 * @property {number} identity
 * @property {number} catalog
 * @property {number} pricing
 * @property {number} media
 * @property {number} branding
 * @property {number} exactCoverage
 * @property {number} fallbackRatio
 * @property {string[]} blockers
 */

/**
 * @typedef {'IMPORT_CATALOG'|'ENRICH_CATALOG'} CatalogOperation
 */

export const PROVENANCE_SOURCE = {
  OWNER_PROVIDED: 'OWNER_PROVIDED',
  OFFICIAL_SOURCE: 'OFFICIAL_SOURCE',
  VERIFIED_EXTERNAL: 'VERIFIED_EXTERNAL',
  INFERRED_FROM_EVIDENCE: 'INFERRED_FROM_EVIDENCE',
  CATEGORY_FALLBACK: 'CATEGORY_FALLBACK',
  AI_GENERATED: 'AI_GENERATED',
};

export const EVIDENCE_STATUS = {
  EXACT: 'EXACT',
  VERIFIED: 'VERIFIED',
  INFERRED: 'INFERRED',
  FALLBACK: 'FALLBACK',
};

export const CATALOG_OPERATION = {
  IMPORT: 'IMPORT_CATALOG',
  ENRICH: 'ENRICH_CATALOG',
};

export const DEFAULT_FALLBACK_POLICY = {
  allowGeneratedDescriptions: true,
  allowCategoryImages: true,
  allowGeneratedItems: false,
  maxGeneratedItemCount: 0,
  requireOwnerApprovalForGeneratedItems: true,
};

export const DEFAULT_SOURCE_POLICY = {
  minTrustScore: 0.45,
  requireIdentityMatch: true,
  minIdentityMatch: 'PROBABLE_MATCH',
};

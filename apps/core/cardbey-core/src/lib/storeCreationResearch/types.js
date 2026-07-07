/**
 * @typedef {'official_website' | 'google_business' | 'facebook' | 'instagram' | 'booking_platform' | 'directory' | 'review_site' | 'uploaded_document' | 'manual'} ResearchSourceType
 */

/**
 * @typedef {Object} AttributedValue
 * @property {*} value
 * @property {string} [sourceUrl]
 * @property {ResearchSourceType} sourceType
 * @property {number} confidence
 * @property {boolean} [needsOwnerReview]
 */

/**
 * @typedef {Object} DiscoveredSource
 * @property {ResearchSourceType} sourceType
 * @property {string} [sourceUrl]
 * @property {Record<string, unknown>} raw
 * @property {number} priority
 */

/**
 * @typedef {Object} SourceMatchResult
 * @property {boolean} matched
 * @property {number} confidence
 * @property {string[]} reasons
 * @property {DiscoveredSource} source
 */

/**
 * @typedef {Object} ExtractedCatalogItem
 * @property {string} name
 * @property {string} [description]
 * @property {number|null} [price]
 * @property {string} [currency]
 * @property {number|null} [durationMinutes]
 * @property {string} [category]
 * @property {'fixed_booking'|'quote_required'} [serviceMode]
 * @property {'book'|'request_quote'|'add_to_cart'} [executionAction]
 * @property {string} [sourceUrl]
 * @property {ResearchSourceType} [sourceType]
 * @property {number} [confidence]
 * @property {boolean} [needsOwnerReview]
 */

/**
 * @typedef {Object} BusinessFacts
 * @property {AttributedValue} [businessName]
 * @property {AttributedValue} [category]
 * @property {AttributedValue} [description]
 * @property {AttributedValue} [address]
 * @property {AttributedValue} [phone]
 * @property {AttributedValue} [email]
 * @property {AttributedValue} [website]
 * @property {AttributedValue} [openingHours]
 * @property {Record<string, AttributedValue>} [socialLinks]
 * @property {AttributedValue[]} [images]
 * @property {ExtractedCatalogItem[]} [services]
 * @property {ExtractedCatalogItem[]} [products]
 * @property {ExtractedCatalogItem[]} [menuItems]
 * @property {AttributedValue} [reviewsSummary]
 * @property {AttributedValue[]} [sourceEvidence]
 */

/**
 * @typedef {Object} StoreCreationResearchInput
 * @property {string} [businessName]
 * @property {string} [location]
 * @property {string} [website]
 * @property {string} [phone]
 * @property {string} [email]
 * @property {string} [category]
 * @property {Record<string, string>} [socialLinks]
 * @property {string} [ocrText]
 * @property {string} [draftId]
 * @property {string} [missionId]
 * @property {string} [userId]
 */

/**
 * @typedef {Object} BusinessResearchResult
 * @property {boolean} researchRan
 * @property {boolean} fallbackToGenerated
 * @property {boolean} ownerReviewRequired
 * @property {number} confidence
 * @property {BusinessFacts|null} facts
 * @property {import('../businessSemantic/types.js').BusinessProfile|null} businessProfile
 * @property {object|null} catalog
 * @property {SourceMatchResult[]} sourcesUsed
 * @property {SourceMatchResult[]} sourcesPendingConfirmation
 * @property {string[]} logs
 */

export const RESEARCH_LOG = {
  STARTED: '[STORE_RESEARCH_STARTED]',
  SOURCE_DISCOVERED: '[SOURCE_DISCOVERED]',
  SOURCE_MATCHED: '[SOURCE_MATCHED]',
  FACTS_EXTRACTED: '[BUSINESS_FACTS_EXTRACTED]',
  CATALOG_EXTRACTED: '[SERVICE_CATALOG_EXTRACTED]',
  OWNER_REVIEW: '[OWNER_REVIEW_REQUIRED]',
  FALLBACK: '[STORE_RESEARCH_FALLBACK_USED]',
};

export const CONFIDENCE = {
  USE: 0.55,
  OWNER_REVIEW: 0.45,
  REJECT: 0.25,
};

/**
 * JSDoc types for governed service-image resolution.
 */

/**
 * @typedef {object} ServiceImageIntent
 * @property {string} originalTitle
 * @property {string} canonicalTitle
 * @property {string} canonicalCategory
 * @property {string[]} subjectTerms
 * @property {string[]} actionTerms
 * @property {string[]} objectTerms
 * @property {string[]} environmentTerms
 * @property {string[]} positiveTerms
 * @property {string[]} negativeTerms
 * @property {string[]} queries
 */

/**
 * @typedef {object} ServiceImageCandidate
 * @property {string} provider
 * @property {string} [providerAssetId]
 * @property {string} imageUrl
 * @property {string} [thumbnailUrl]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [title]
 * @property {string} [altText]
 * @property {string[]} [tags]
 * @property {string} sourceQuery
 * @property {string} [license]
 * @property {string} [attribution]
 */

/**
 * @typedef {'exact'|'strong'|'acceptable'|'category_fallback'|'placeholder'|'missing'} ServiceImageMatchStatus
 */

/**
 * @typedef {object} ServiceImageSelection
 * @property {string} provider
 * @property {string} [providerAssetId]
 * @property {string} sourceQuery
 * @property {string} canonicalService
 * @property {number} metadataScore
 * @property {number} [visualScore]
 * @property {number} finalScore
 * @property {ServiceImageMatchStatus} matchStatus
 * @property {string[]} matchedTerms
 * @property {string[]} [rejectedConflicts]
 * @property {string} selectedAt
 */

export {};

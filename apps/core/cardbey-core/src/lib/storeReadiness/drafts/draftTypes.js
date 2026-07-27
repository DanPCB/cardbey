/**
 * @typedef {'draft'|'awaiting_approval'|'approved'|'rejected'|'applied'|'discarded'} ReadinessDraftStatus
 *
 * @typedef {'business_description'|'hero_headline'|'hero_subheading'|'cta_text'|'product_description'|'service_description'|'faq'|'campaign_copy'|'loyalty_introduction'} ReadinessDraftType
 *
 * @typedef {object} ReadinessDraft
 * @property {string} id
 * @property {string} storeId
 * @property {string} ownerUserId
 * @property {string|null} findingId
 * @property {string|null} findingCode
 * @property {ReadinessDraftType} draftType
 * @property {ReadinessDraftStatus} status
 * @property {string} generatedBy
 * @property {Record<string, unknown>} content
 * @property {string|null} targetObjectType
 * @property {string|null} targetObjectId
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {object|null} approval
 * @property {number} generation
 * @property {number|null} readinessScoreBefore
 * @property {number|null} readinessScoreAfter
 *
 * @typedef {object} ReadinessDraftApprovalRecord
 * @property {string} draftId
 * @property {string} storeId
 * @property {string} ownerUserId
 * @property {'approved'|'rejected'|'applied'|'regenerated'} action
 * @property {string} timestamp
 * @property {string|null} sourceDraftId
 * @property {string|null} note
 */

export {};

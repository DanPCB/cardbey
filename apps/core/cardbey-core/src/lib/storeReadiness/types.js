/**
 * @typedef {'not_started'|'in_progress'|'nearly_ready'|'ready'|'live_needs_attention'} StoreReadinessStatus
 * @typedef {'critical'|'important'|'improvement'|'optional'} ReadinessSeverity
 * @typedef {'navigate'|'generate_content'|'suggest_edit'|'run_validation'|'request_approval'} SellerActionType
 * @typedef {'must_fix'|'should_improve'|'growth'} RecommendationGroup
 *
 * @typedef {object} AffectedObjectRef
 * @property {'store'|'product'|'media'|'cta'|'contact'} type
 * @property {string} [id]
 * @property {string} [label]
 *
 * @typedef {object} StoreReadinessFinding
 * @property {string} code
 * @property {ReadinessSeverity} severity
 * @property {string} category
 * @property {string} title
 * @property {string} explanation
 * @property {string[]} evidence
 * @property {AffectedObjectRef|null} affectedObject
 * @property {SellerActionType} recommendedActionType
 * @property {string|null} destination
 * @property {boolean} pilCanAssist
 * @property {boolean} pilCanExecute
 * @property {string} generatedAt
 *
 * @typedef {object} ReadinessSection
 * @property {string} key
 * @property {number} score
 * @property {'blocked'|'needs_attention'|'improving'|'complete'} status
 * @property {number} findingCount
 * @property {number} criticalCount
 * @property {number} importantCount
 *
 * @typedef {object} SellerRecommendedAction
 * @property {string} id
 * @property {string} findingCode
 * @property {RecommendationGroup} group
 * @property {string} title
 * @property {string} explanation
 * @property {SellerActionType} actionType
 * @property {string|null} destination
 * @property {AffectedObjectRef|null} affectedObject
 * @property {boolean} pilCanAssist
 * @property {boolean} pilCanExecute
 * @property {number} priority
 *
 * @typedef {object} StoreReadinessSnapshot
 * @property {string} storeId
 * @property {string} ownerUserId
 * @property {string} generatedAt
 * @property {number} overallScore
 * @property {StoreReadinessStatus} status
 * @property {{
 *   businessProfile: ReadinessSection,
 *   branding: ReadinessSection,
 *   catalog: ReadinessSection,
 *   storefront: ReadinessSection,
 *   contactAndLocation: ReadinessSection,
 *   commerce: ReadinessSection,
 *   marketing: ReadinessSection,
 *   trustAndCompliance: ReadinessSection,
 * }} sections
 * @property {StoreReadinessFinding[]} findings
 * @property {SellerRecommendedAction[]} recommendedActions
 * @property {SellerRecommendedAction[]} primaryActions
 */

export {};

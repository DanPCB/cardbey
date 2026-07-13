/**
 * @typedef {'SOURCE_DRIVEN' | 'INTENT_DRIVEN' | 'HYBRID'} LoyaltySourceMode
 */

/**
 * @typedef {'SOURCE_EXTRACTED' | 'OWNER_DEFINED' | 'AI_RECOMMENDED'} LoyaltyRuleProvenance
 */

/**
 * @typedef {'VISION_EXTRACTED' | 'OWNER_DEFINED' | 'DEFAULT_TEMPLATE' | 'NONE'} LoyaltyTopologyProvenance
 */

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   rule: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule;
 *   rationale: string;
 *   estimatedBusinessCost?: string;
 *   customerValue?: string;
 *   confidence: number;
 *   basedOnCatalogRefs: string[];
 *   suggestionOnly?: boolean;
 * }} LoyaltyRecommendation
 */

/**
 * @typedef {{
 *   sourceMode: LoyaltySourceMode;
 *   storeId: string;
 *   rule: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null;
 *   cardTopology?: import('./loyaltyTopologyTypes.js').LoyaltyCardTopology;
 *   sourceEvidence?: {
 *     evidenceId?: string;
 *     assetRef?: string;
 *     confidence?: number;
 *   };
 *   recommendationContext?: {
 *     businessCategory?: string;
 *     catalogRefs?: string[];
 *     reasoningSummary?: string;
 *   };
 *   provenance: {
 *     ruleSource: LoyaltyRuleProvenance;
 *     topologySource: LoyaltyTopologyProvenance;
 *   };
 *   requiresOwnerReview: boolean;
 *   recommendations?: LoyaltyRecommendation[];
 *   selectedRecommendationId?: string;
 *   hybridContext?: {
 *     originalRule: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null;
 *     originalTopology: import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null;
 *     proposedRule: import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null;
 *     layoutChoice?: 'preserve' | 'redesign' | 'simplified';
 *   };
 *   cardFooterText?: string;
 *   missingFields?: string[];
 *   programName?: string;
 *   rejected?: boolean;
 * }} LoyaltyCreationContract
 */

export {};

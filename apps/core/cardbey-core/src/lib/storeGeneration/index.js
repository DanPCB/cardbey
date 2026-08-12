/**
 * Business-aware store generation contracts.
 * Phase 2: wired into generateDraftTwoModes behind ENABLE_GROUNDED_STORE_CREATION_V1.
 */

export {
  FIELD_STATUSES,
  storeField,
  isFactuallyTrusted,
} from './fieldStatus.js';

export {
  createEmptyEvidenceBundle,
  addExtractedFact,
  addVisualSignal,
  getFact,
} from './evidenceBundle.js';

export {
  createEmptyBusinessUnderstanding,
  toDisplayReadyCopy,
} from './businessUnderstanding.js';

export {
  createEmptyBrandStyleProfile,
  THEME_PRIORITY_TIERS,
  resolveThemePriorityTier,
} from './brandStyleProfile.js';

export {
  BUSINESS_ARCHETYPES,
  ARCHETYPE_DEFAULTS,
  inferArchetypeFromHints,
  getArchetypeDefaults,
} from './businessArchetypes.js';

export {
  createEmptyThemeSpec,
  buildStoreCompositionPlan,
  evaluateCompositionGenericness,
} from './storeCompositionPlan.js';

export {
  composeGroundedStoreIntelligence,
  applyCompositionToGenerationParams,
  collectEvidenceOfferings,
  extractOfferingLinesFromText,
  mapSectionsToWebsiteTypes,
  buildResourceNeeds,
  buildCatalogFromGroundedOfferings,
} from './buildGroundedComposition.js';

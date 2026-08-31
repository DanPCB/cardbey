export {
  PROJECTOR_VERSION,
  PROJECTION_VERSION,
  PROJECTION_WARNING_CODES,
  freezeStorefrontProjection,
  freezeProjectedSection,
  freezeWarning,
} from './projectionResult.js';
export {
  CONTENT_ROLE_TO_SECTION,
  mapContentRoleToSection,
  isForbiddenPlacement,
  FORBIDDEN_OFFERING_ROLES,
} from './contentRoleMapper.js';
export { selectSectionVariant, VARIANT_CATALOG } from './sectionVariantSelector.js';
export {
  gatherProjectionEvidence,
  resolveItemRef,
  passesConfidenceThreshold,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
} from './projectionEvidence.js';
export {
  projectBlueprintSection,
  projectPoliciesSection,
  enrichFooterSection,
  SECTION_CONTENT_ROLES,
  CTA_SECTION_HINTS,
} from './sectionProjector.js';
export { projectStorefront } from './storefrontProjector.js';
export { validateStorefrontProjection } from './projectionValidator.js';
export {
  projectStorefrontForDraft,
  applyDesignLibraryStorefrontProjection,
  emitProjectionCompleted,
} from './projectStorefrontForDraft.js';

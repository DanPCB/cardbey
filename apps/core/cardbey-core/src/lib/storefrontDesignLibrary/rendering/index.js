export {
  ADAPTER_VERSION,
  COMPARISON_VERSION,
  RENDER_VIEW_MODEL_VERSION,
  LEGACY_EXTRACTOR_VERSION,
  CURRENT_RENDERER_CAPABILITIES,
  SEMANTIC_TO_RENDERER_TYPE,
  RENDER_ACTION_LABELS,
  resolveRendererCapabilities,
} from './renderCompatibility.js';
export {
  resolveProjectionItems,
  assertNonCommerceRole,
} from './projectionItemAdapter.js';
export { adaptProjectedSection } from './projectionSectionAdapter.js';
export {
  adaptProjectionToRenderViewModel,
  buildRenderAction,
  summarizeRenderViewModel,
} from './projectionRenderAdapter.js';
export { extractLegacyStorefrontStructure } from './legacyStructureExtractor.js';
export { compareLegacyAndProjectedStorefront } from './shadowComparison.js';
export {
  freezeShadowComparison,
  SHADOW_COMPARISON_VERSION,
  COMPARISON_FINDING_CODES,
} from './shadowComparisonResult.js';
export { validateRenderViewModel } from './renderAdapterValidator.js';
export {
  applyDesignLibraryRenderShadow,
  buildProjectionPreviewPayload,
} from './applyDesignLibraryRenderShadow.js';
export {
  canAccessProjectionPreview,
  isProjectionPreviewQueryEnabled,
  PROJECTION_PREVIEW_QUERY,
} from './projectionPreviewAccess.js';

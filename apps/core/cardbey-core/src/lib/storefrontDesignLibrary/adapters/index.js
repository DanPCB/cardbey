export {
  LEGACY_THEME_TEMPLATE_ID_TO_VISUAL_THEME_ID,
  mapLegacyThemeTemplateIdToVisualThemeId,
  mapVisualThemeIdToPreferredLegacyThemeTemplateId,
} from './legacyThemeAdapter.js';
export {
  mapLayoutTypeToBlueprintRole,
  adaptLayoutDefinitionToStructuralMetadata,
} from './websiteTemplateFoundationAdapter.js';
export {
  suggestPreviewSampleIdFromTemplateSlug,
  adaptContentTemplateToPreviewSample,
  findPreviewSamplesForContentTemplateSlug,
} from './contentTemplateAdapter.js';

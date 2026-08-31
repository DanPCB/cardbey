/**
 * Phase 8A — accepted draft preview rendering (auth preview only).
 * Do not import from public storefront or publish snapshot builders.
 */

export { resolvePreviewRenderSource } from './resolvePreviewRenderSource.js';
export {
  buildLegacyPreviewPackage,
  LEGACY_PREVIEW_PACKAGE_VERSION,
} from './buildLegacyPreviewPackage.js';
export {
  buildProjectionPreviewPackage,
  PROJECTION_PREVIEW_PACKAGE_VERSION,
} from './buildProjectionPreviewPackage.js';
export { buildPreviewRenderPayload } from './buildPreviewRenderPayload.js';

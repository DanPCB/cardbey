/**
 * Projection Renderer Cutover V1 — live storefront render source (not publish).
 * Import only from draft-store routes / authorised render assembly.
 */

export { resolveLiveRenderSource } from './resolveLiveRenderSource.js';
export {
  buildLiveRenderPackage,
  buildLegacyLiveRenderPackage,
  LIVE_RENDER_PACKAGE_VERSION,
} from './buildLiveRenderPackage.js';
export { buildLiveRenderPayload } from './buildLiveRenderPayload.js';
export {
  assessCriticalSectionSupport,
  CRITICAL_SEMANTIC_ROLES,
} from './criticalSectionCheck.js';
export {
  emitRenderSourceSelected,
  emitProjectionRenderCompleted,
  emitProjectionRenderFallback,
} from './emitRenderCutoverEvents.js';

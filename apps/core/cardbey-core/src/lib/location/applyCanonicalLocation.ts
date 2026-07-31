/**
 * TypeScript facade — canonical runtime is applyCanonicalLocation.js
 */

export type {
  CanonicalBusinessLocation,
  ResolveCanonicalBusinessLocationInput,
} from './resolveCanonicalBusinessLocation.js';

export {
  buildResolveInputFromDraftInput,
  applyCanonicalLocationToPreview,
  draftColumnPatchFromCanonical,
  businessColumnPatchFromCanonical,
  resolveAndApplyCanonicalLocationForDraft,
  mergeCanonicalContactForPublish,
} from './applyCanonicalLocation.js';

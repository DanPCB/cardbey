export {
  CONTENT_OWNERSHIP,
  CONTENT_OWNERSHIP_SET,
  REQUIRES_EXPLICIT_OPT_IN,
  DEFAULT_ALLOW_GENERATE,
  isContentOwnership,
  assertContentOwnership,
  requiresExplicitOptIn,
  defaultAllowGenerate,
} from './contentOwnership.js';

export {
  CONSUMPTION_STATUSES,
  isConsumptionStatus,
  normalizeConsumptionStatus,
} from './consumptionStatus.js';

export { applyFallbackToOriginal } from './fallbackPolicy.js';

export {
  CONSUMPTION_BOUNDARY_VERSION,
  PLANNED_CONSUMER_SURFACES,
  assertConsumptionBoundary,
} from './consumptionBoundary.js';

export { buildLocalizedConsumption } from './buildLocalizedConsumption.js';
export {
  consumeLocalizedContent,
  getConsumptionFrameworkInfo,
} from './consumeLocalizedContent.js';

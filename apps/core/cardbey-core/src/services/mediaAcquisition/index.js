/**
 * Rich Media Acquisition — public service surface.
 */

export {
  ACQUISITION_DECISION,
  DISCOVERY_ONLY_PROVIDERS,
  SOURCE_ROLE,
  sourceRoleForProvider,
  resolveAcquisitionDecision,
} from './acquisitionDecision.js';

export {
  toDiscoveryCandidate,
  dedupeDiscoveryCandidates,
  rankDiscoveryCandidates,
} from './discoveryCandidate.js';

export { expandMediaQuery } from './queryExpansion.js';

export {
  runFederatedMediaSearch,
  PROVIDER_STATUS,
  DEFAULT_ACQUISITION_SOURCES,
} from './federatedMediaSearch.js';

export { acquireCandidateToLibrary } from './acquireToLibrary.js';

export {
  addToReviewQueue,
  listReviewQueue,
  getReviewItem,
  resolveReviewItem,
  resetReviewQueueForTests,
} from './reviewQueue.js';

export {
  recordMediaAcquisitionEvent,
  listMediaAcquisitionEvents,
  resetMediaAcquisitionEventsForTests,
} from './observability.js';

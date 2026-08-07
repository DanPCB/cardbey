/**
 * Business Discovery Layer (BDL) — Phase 4 foundation.
 *
 * Canonical publishing projection for SEO, AI search, social, directory, APIs.
 * Not the acquisition package at lib/businessDiscovery/.
 *
 * Authority: isBusinessDiscoveryAuthoritative() === false (no consumer cutover).
 * Multilingual SEO is Stage 6 and must not be implemented here.
 */

export * from './contracts/index.js';
export * from './projection/index.js';
export * from './validation/index.js';
export * from './events/index.js';
export * from './cache/index.js';
export { generateDiscoveryProjection, invalidateBusinessDiscovery } from './generateDiscoveryProjection.js';

export {
  isBusinessDiscoveryLayerV1Enabled,
  isBusinessDiscoveryProjectionV1Enabled,
  isBusinessDiscoveryValidationV1Enabled,
  isBusinessDiscoveryEventsV1Enabled,
  isBusinessDiscoveryCacheV1Enabled,
  isBusinessDiscoveryConsumerCutoverV1Enabled,
  isBusinessDiscoverySeoConsumerV1Enabled,
  isBusinessDiscoveryAuthoritative,
} from './flags.js';

import {
  isBusinessDiscoveryLayerV1Enabled,
  isBusinessDiscoveryProjectionV1Enabled,
  isBusinessDiscoveryValidationV1Enabled,
  isBusinessDiscoveryEventsV1Enabled,
  isBusinessDiscoveryCacheV1Enabled,
  isBusinessDiscoveryConsumerCutoverV1Enabled,
  isBusinessDiscoverySeoConsumerV1Enabled,
  isBusinessDiscoveryAuthoritative,
} from './flags.js';

export function getBusinessDiscoveryDiagnostics() {
  return {
    package: 'businessDiscoveryLayer',
    phase: 'phase4_foundation',
    stageName: 'Business Discovery Layer (BDL) Foundation',
    renamedFrom: 'Stage 5B Multilingual SEO Architecture',
    authoritative: isBusinessDiscoveryAuthoritative(),
    flags: {
      layerV1: isBusinessDiscoveryLayerV1Enabled(),
      projectionV1: isBusinessDiscoveryProjectionV1Enabled(),
      validationV1: isBusinessDiscoveryValidationV1Enabled(),
      eventsV1: isBusinessDiscoveryEventsV1Enabled(),
      cacheV1: isBusinessDiscoveryCacheV1Enabled(),
      consumerCutoverV1: isBusinessDiscoveryConsumerCutoverV1Enabled(),
      seoConsumerV1: isBusinessDiscoverySeoConsumerV1Enabled(),
    },
    consumersDeferred: [
      'multilingual_seo',
      'ai_discovery',
      'social_cards',
      'cardbey_directory',
      'business_distribution',
    ],
    namingNote:
      'Sibling of lib/businessDiscovery (acquisition). Do not conflate packages.',
  };
}

/**
 * Runtime authority guard — Discovery Engine must never bypass governed onboarding.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';

export function assertDiscoverySeedsGoverned(seeds: IngestedSeedRecord[]): void {
  for (const seed of seeds) {
    if (seed.storeId != null) {
      throw new Error(
        `Runtime authority violation: discovery seed ${seed.id} has storeId (DraftStore/Business must not be created)`,
      );
    }
    if (seed.draftId != null) {
      throw new Error(
        `Runtime authority violation: discovery seed ${seed.id} has draftId`,
      );
    }
    if (seed.verificationStatus !== 'seeded_pending_qa' && seed.verificationStatus !== 'duplicate') {
      throw new Error(
        `Runtime authority violation: discovery seed ${seed.id} has status ${seed.verificationStatus} (expected seeded_pending_qa)`,
      );
    }
  }
}

/** Static audit — promotion pipeline must never enable store persistence. */
export const DISCOVERY_PIPELINE_GOVERNANCE = {
  persistStores: false,
  persistSeeds: true,
  skipDuplicates: true,
} as const;

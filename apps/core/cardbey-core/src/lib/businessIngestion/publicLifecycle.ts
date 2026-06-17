/**
 * Public lifecycle translation — internal ingestion states → user-facing labels.
 * Never expose seed/QA/governance terminology in public APIs.
 */

import type { SeedVerificationStatus } from './types.js';

/** User-facing lifecycle (public layer only). */
export type PublicBusinessLifecycle = 'discovered_business' | 'verified_owner' | 'business_space';

const PUBLIC_LIFECYCLE_LABEL: Record<PublicBusinessLifecycle, string> = {
  discovered_business: 'Discovered Business',
  verified_owner: 'Verified Owner',
  business_space: 'Business Space',
};

export function translateSeedToPublicLifecycle(
  status: SeedVerificationStatus,
): PublicBusinessLifecycle | null {
  switch (status) {
    case 'seeded_claimable':
      return 'discovered_business';
    case 'verified_owner':
      return 'verified_owner';
    case 'active':
      return 'business_space';
    default:
      return null;
  }
}

export function publicLifecycleLabel(lifecycle: PublicBusinessLifecycle): string {
  return PUBLIC_LIFECYCLE_LABEL[lifecycle];
}

export const DISCOVERED_BUSINESS_BADGE = 'Discovered by Cardbey';

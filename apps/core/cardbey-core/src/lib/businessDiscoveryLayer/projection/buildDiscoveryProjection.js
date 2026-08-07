/**
 * Discovery Projection Engine — single entry to build BusinessDiscoveryProjection.
 */

import { isBusinessDiscoveryProjectionV1Enabled } from '../flags.js';
import { buildBusinessDiscoveryProjection } from '../contracts/discoveryProjection.js';
import { mapPublishedArtifactToDiscoveryInput } from './fromPublishedArtifact.js';
import { mapPublicStoreToDiscoveryInput } from './fromPublicStore.js';

/**
 * Build a canonical discovery projection from the best available source.
 *
 * Priority:
 * 1. publishedArtifact
 * 2. publicStore (fallback)
 *
 * Does not persist, publish, or cut over any consumer.
 *
 * @param {object} params
 * @param {object} [params.publishedArtifact]
 * @param {object} [params.publicStore]
 * @param {object|null} [params.storefrontLocalization]
 * @param {boolean} [params.translationApprovedForDiscovery]
 * @param {object|null} [params.reviews]
 * @param {object|null} [params.policies]
 * @returns {{ ok: true, projection: import('../contracts/discoveryProjection.js').BusinessDiscoveryProjection } | { ok: false, reason: string }}
 */
export function buildDiscoveryProjection(params = {}) {
  if (!isBusinessDiscoveryProjectionV1Enabled()) {
    return { ok: false, reason: 'business_discovery_projection_disabled' };
  }

  const {
    publishedArtifact = null,
    publicStore = null,
    storefrontLocalization = null,
    translationApprovedForDiscovery = false,
    reviews = null,
    policies = null,
  } = params;

  try {
    let input;
    if (publishedArtifact) {
      input = mapPublishedArtifactToDiscoveryInput(publishedArtifact, {
        storefrontLocalization,
        translationApprovedForDiscovery,
        reviews,
        policies,
      });
    } else if (publicStore) {
      input = mapPublicStoreToDiscoveryInput(publicStore, {
        storefrontLocalization,
        translationApprovedForDiscovery,
        reviews,
        policies,
      });
    } else {
      return { ok: false, reason: 'no_discovery_source' };
    }

    const projection = buildBusinessDiscoveryProjection(input);
    return { ok: true, projection };
  } catch (err) {
    return {
      ok: false,
      reason: 'projection_build_failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Orchestrate generate → validate → (optional) cache → emit events.
 * Does not publish to SEO/AI/directory consumers.
 */

import { isBusinessDiscoveryLayerV1Enabled, isBusinessDiscoveryAuthoritative } from './flags.js';
import { buildDiscoveryProjection } from './projection/buildDiscoveryProjection.js';
import { validateDiscoveryProjection } from './validation/validateDiscoveryProjection.js';
import { emitDiscoveryEvent } from './events/discoveryEventBus.js';
import { DISCOVERY_EVENT_TYPES } from './contracts/discoveryEvent.js';
import {
  DISCOVERY_CACHE_NAMESPACES,
  setDiscoveryCache,
  invalidateDiscoveryCachesForBusiness,
} from './cache/index.js';

/**
 * @param {object} params - same as buildDiscoveryProjection + validation opts
 * @param {boolean} [params.emitEvents]
 * @param {boolean} [params.writeCache]
 * @param {boolean} [params.requireTranslationApproval]
 * @param {'generated'|'updated'} [params.mode]
 * @returns {object}
 */
export function generateDiscoveryProjection(params = {}) {
  if (!isBusinessDiscoveryLayerV1Enabled()) {
    return {
      ok: false,
      reason: 'business_discovery_layer_disabled',
      authoritative: isBusinessDiscoveryAuthoritative(),
    };
  }

  const {
    emitEvents = true,
    writeCache = true,
    requireTranslationApproval = false,
    mode = 'generated',
    ...buildParams
  } = params;

  const built = buildDiscoveryProjection(buildParams);
  if (!built.ok) {
    if (emitEvents && buildParams.publishedArtifact?.businessId) {
      emitDiscoveryEvent({
        type: DISCOVERY_EVENT_TYPES.INVALIDATED,
        businessId: buildParams.publishedArtifact.businessId,
        slug: buildParams.publishedArtifact.slug || null,
        reason: built.reason,
      });
    }
    return { ...built, authoritative: isBusinessDiscoveryAuthoritative() };
  }

  const validation = validateDiscoveryProjection(built.projection, {
    requireTranslationApproval,
  });

  if (writeCache && built.projection.businessId) {
    const key = built.projection.businessId;
    setDiscoveryCache(DISCOVERY_CACHE_NAMESPACES.PROJECTION, key, built.projection);
    setDiscoveryCache(
      DISCOVERY_CACHE_NAMESPACES.METADATA,
      key,
      built.projection.discoveryMetadata,
    );
  }

  if (emitEvents) {
    const eventType =
      mode === 'updated' ? DISCOVERY_EVENT_TYPES.UPDATED : DISCOVERY_EVENT_TYPES.GENERATED;
    emitDiscoveryEvent({
      type: eventType,
      businessId: built.projection.businessId,
      slug: built.projection.slug,
      projectionId: built.projection.projectionId,
      payload: {
        publishable: validation.publishable,
        status: validation.status,
      },
    });

    if (validation.publishable) {
      emitDiscoveryEvent({
        type: DISCOVERY_EVENT_TYPES.PUBLISHED,
        businessId: built.projection.businessId,
        slug: built.projection.slug,
        projectionId: built.projection.projectionId,
        reason: 'validation_passed',
        payload: {
          note: 'Discovery-published means projection is publishable to consumers — not SEO live cutover',
        },
      });
    }
  }

  return {
    ok: true,
    projection: built.projection,
    validation,
    authoritative: isBusinessDiscoveryAuthoritative(),
  };
}

/**
 * Invalidate discovery caches + emit invalidated event.
 * @param {string} businessId
 * @param {object} [opts]
 */
export function invalidateBusinessDiscovery(businessId, opts = {}) {
  if (!isBusinessDiscoveryLayerV1Enabled()) {
    return { ok: false, reason: 'business_discovery_layer_disabled' };
  }
  const cleared = invalidateDiscoveryCachesForBusiness(businessId);
  if (opts.emitEvents !== false) {
    emitDiscoveryEvent({
      type: DISCOVERY_EVENT_TYPES.INVALIDATED,
      businessId,
      slug: opts.slug || null,
      reason: opts.reason || 'manual_invalidate',
    });
  }
  return { ok: true, cleared };
}

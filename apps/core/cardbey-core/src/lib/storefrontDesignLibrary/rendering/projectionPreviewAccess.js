/**
 * Authorised projection preview access helpers (Phase 6).
 * Public canonical storefront must not use these.
 */

import {
  isDesignLibraryV1Enabled,
  isStorefrontProjectionPreviewEnabled,
} from '../flags.js';

/**
 * @param {{ role?: string, roles?: string[], isOwner?: boolean, userId?: string } | null | undefined} actor
 * @param {{ ownerUserId?: string | null }} [resource]
 * @returns {boolean}
 */
export function canAccessProjectionPreview(actor, resource = {}) {
  if (!isDesignLibraryV1Enabled() || !isStorefrontProjectionPreviewEnabled()) {
    return false;
  }
  if (!actor || typeof actor !== 'object') return false;

  const roles = new Set(
    [
      ...(Array.isArray(actor.roles) ? actor.roles : []),
      ...(actor.role ? [actor.role] : []),
    ].map((r) => String(r).toLowerCase()),
  );

  const privileged = ['platform_admin', 'admin', 'developer', 'dev', 'staff'].some((r) =>
    roles.has(r),
  );
  if (privileged) return true;

  if (actor.isOwner === true) return true;
  if (
    resource.ownerUserId &&
    actor.userId &&
    String(resource.ownerUserId) === String(actor.userId)
  ) {
    return true;
  }
  return false;
}

/**
 * Query-param / mode marker for controlled preview (not indexable public flag).
 */
export const PROJECTION_PREVIEW_QUERY = 'projectionPreview';

/**
 * @param {URLSearchParams | Record<string, string> | null | undefined} query
 */
export function isProjectionPreviewQueryEnabled(query) {
  if (!query) return false;
  const raw =
    typeof query.get === 'function'
      ? query.get(PROJECTION_PREVIEW_QUERY)
      : query[PROJECTION_PREVIEW_QUERY];
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Public feed / storefront visibility rules for Business rows.
 */

/**
 * Guest-owned or guest-draft stores must not appear on public discovery surfaces.
 * @param {{ userId?: string | null, isGuestDraft?: boolean | null, expiresAt?: Date | string | null } | null | undefined} business
 */
export function isAbandonedGuestOwnedBusiness(business) {
  if (!business) return false;
  if (business.isGuestDraft === true) return true;
  const uid = String(business.userId ?? '').trim().toLowerCase();
  if (uid.startsWith('guest_')) return true;
  if (business.expiresAt) {
    const expires = business.expiresAt instanceof Date ? business.expiresAt : new Date(business.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires < new Date()) return true;
  }
  return false;
}

/**
 * @param {{ userId?: string | null, isGuestDraft?: boolean | null, expiresAt?: Date | string | null, isActive?: boolean | null, publishedAt?: Date | string | null } | null | undefined} business
 */
export function isPublicFeedEligibleBusiness(business) {
  if (!business) return false;
  if (isAbandonedGuestOwnedBusiness(business)) return false;
  return business.isActive === true || business.publishedAt != null;
}

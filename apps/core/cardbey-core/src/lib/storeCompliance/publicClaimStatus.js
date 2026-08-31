/**
 * Public claim-status helpers for ACCC compliance surfaces.
 */

const CLAIMED_STATUSES = new Set(['claimed', 'verified', 'activated', 'operating']);

/**
 * @param {{ claimStatus?: string | null, provenance?: string | null } | null | undefined} store
 */
export function isPublicStoreClaimed(store) {
  if (!store) return false;
  const claim = String(store.claimStatus ?? '').toLowerCase();
  const prov = String(store.provenance ?? '').toLowerCase();
  if (CLAIMED_STATUSES.has(claim)) return true;
  if (!claim && prov === 'owner') return true;
  return false;
}

/**
 * @param {{ claimStatus?: string | null, provenance?: string | null } | null | undefined} store
 */
export function isPublicStoreUnclaimed(store) {
  if (!store) return false;
  const claim = String(store.claimStatus ?? '').toLowerCase();
  if (claim === 'removed') return false;
  return !isPublicStoreClaimed(store);
}

/**
 * @param {string | null | undefined} abn
 */
export function abrVerificationUrl(abn) {
  const digits = String(abn ?? '').replace(/\s/g, '');
  if (!digits) return null;
  return `https://abn.business.gov.au/ABN/View?abn=${digits}`;
}

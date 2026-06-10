/**
 * Retired live test/demo stores — hidden from public feed and owner store lists.
 * Run scripts/remove-live-test-stores.mjs on production Postgres to hard-delete rows.
 */

/** Orphan demo rows only — keep ABC Fashion, AA Travel, My Fashion, Melbourne Flooring, etc. */
export const LIVE_RETIRED_TEST_STORE_SLUGS = new Set([
  'shop-cafe',
  'my-cafe',
  'my-business',
  'my-business-2',
]);

/** @param {{ slug?: string | null } | null | undefined} business */
export function isRetiredLiveTestStore(business) {
  const slug = String(business?.slug ?? '').toLowerCase().trim();
  return slug.length > 0 && LIVE_RETIRED_TEST_STORE_SLUGS.has(slug);
}

/**
 * Retired live test/demo stores — hidden from public feed and owner store lists.
 * Run scripts/remove-live-test-stores.mjs on production Postgres to hard-delete rows.
 */

export const LIVE_RETIRED_TEST_STORE_SLUGS = new Set([
  'my-business',
  'my-business-2',
  'my-cafe',
  'shop-cafe',
  'melbourne-flooring',
  'abc-fashion',
  'aa-travel-golf-tour',
  'aa-travel-and-golf-tour',
  'my-fashion',
]);

/** @param {{ slug?: string | null } | null | undefined} business */
export function isRetiredLiveTestStore(business) {
  const slug = String(business?.slug ?? '').toLowerCase().trim();
  return slug.length > 0 && LIVE_RETIRED_TEST_STORE_SLUGS.has(slug);
}

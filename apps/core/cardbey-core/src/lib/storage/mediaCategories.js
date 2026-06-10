/**
 * Object key prefixes under media/ in object storage.
 * @typedef {'logos' | 'avatars' | 'stores' | 'products' | 'videos' | 'artifacts'} MediaCategory
 */

/** @type {readonly MediaCategory[]} */
export const MEDIA_CATEGORIES = Object.freeze([
  'logos',
  'avatars',
  'stores',
  'products',
  'videos',
  'artifacts',
]);

/**
 * @param {string | null | undefined} value
 * @returns {value is MediaCategory}
 */
export function isMediaCategory(value) {
  return typeof value === 'string' && MEDIA_CATEGORIES.includes(/** @type {MediaCategory} */ (value));
}

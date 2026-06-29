/**
 * Canonical public feed item contract.
 *
 * Organic feed: at most one item per storeId.
 * Sponsored/featured duplicates require explicit placementType.
 */

/** @typedef {'organic' | 'sponsored' | 'featured' | 'preview'} FeedPlacementType */

/**
 * @typedef {object} FeedItem
 * @property {string} id — stable feed entry id
 * @property {string} storeId — published Business.id
 * @property {FeedPlacementType} placementType
 * @property {string} source — assembler segment (e.g. public_stores_feed)
 * @property {number} [rank]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {object} store — PublicStore DTO
 */

export const ORGANIC_PLACEMENT = 'organic';
export const SPONSORED_PLACEMENT = 'sponsored';
export const FEATURED_PLACEMENT = 'featured';
export const PREVIEW_PLACEMENT = 'preview';

/**
 * @param {unknown} value
 * @returns {value is FeedPlacementType}
 */
export function isFeedPlacementType(value) {
  return (
    value === ORGANIC_PLACEMENT ||
    value === SPONSORED_PLACEMENT ||
    value === FEATURED_PLACEMENT ||
    value === PREVIEW_PLACEMENT
  );
}

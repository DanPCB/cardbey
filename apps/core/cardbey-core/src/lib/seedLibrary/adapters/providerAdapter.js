/**
 * Provider adapter interface for Seed Library ingestion.
 * Implementations: pexelsAdapter, (future) unsplashAdapter, pixabayAdapter.
 *
 * @typedef {Object} NormalizedPhoto
 * @property {string} id - Provider's asset id
 * @property {string} url - Primary image URL (full size)
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [photographerName]
 * @property {string} [photographerUrl]
 * @property {string} [sourcePageUrl] - Canonical page URL for attribution
 * @property {string} [licenseUrl]
 * @property {string} [attributionText] - Preformatted attribution line
 * @property {string} [alt]
 * @property {Object} [src] - Optional map of role -> url (e.g. { medium: url, small: url })
 */

/**
 * Provider adapter interface.
 * Adapters (e.g. pexelsAdapter) implement searchPhotos(query, page, perPage) => { photos, totalResults?, page? }.
 * NormalizedPhoto: id, url, width?, height?, photographerName?, photographerUrl?, sourcePageUrl?, licenseUrl?, attributionText?, alt?, src?.
 */

import { normalizePublicOrigin } from './publicUrl.js';

/**
 * Media URL Normalizer
 * 
 * Automatically fixes old media URLs (e.g., with host 192.168.1.12) when responses
 * are returned, so frontends and device players always see correct URLs even if the
 * DB still contains the old host.
 * 
 * This is a "read-time" fix that doesn't mutate the database - only modifies objects
 * being sent in the response.
 */

/**
 * Old hosts that should be replaced with the current core base URL
 */
const OLD_HOSTS = [
  'http://192.168.1.12:3001',
  'http://192.168.1.7:3001',
  'https://192.168.1.12:3001',
  'https://192.168.1.7:3001',
];

/**
 * Get the current core base URL from request or environment
 * 
 * @param {express.Request} req - Express request object
 * @returns {string} Core base URL (e.g., "http://192.168.1.3:3001")
 */
export function getCoreBaseUrl(req) {
  // Prefer environment variable if set (most reliable)
  if (process.env.CORE_BASE_URL) {
    return normalizePublicOrigin(process.env.CORE_BASE_URL.replace(/\/+$/, ''));
  }
  
  // Also check PUBLIC_BASE_URL or PUBLIC_API_BASE_URL
  if (process.env.PUBLIC_BASE_URL) {
    return normalizePublicOrigin(process.env.PUBLIC_BASE_URL.replace(/\/+$/, ''));
  }
  if (process.env.PUBLIC_API_BASE_URL) {
    return normalizePublicOrigin(process.env.PUBLIC_API_BASE_URL.replace(/\/+$/, ''));
  }
  
  // Build from request (but normalize old IPs if present)
  if (req && req.protocol && req.get) {
    const host = req.get('host') || req.headers.host || 'localhost:3001';
    const baseUrl = `${req.protocol}://${host}`;
    
    // If the request host is an old IP, replace it with a known good one
    // This handles cases where the request comes from a client using old IP
    for (const oldHost of OLD_HOSTS) {
      if (baseUrl.startsWith(oldHost)) {
        // Try to get a better base URL from env or use a default
        const fallback = process.env.CORE_BASE_URL || 
                        process.env.PUBLIC_BASE_URL || 
                        process.env.PUBLIC_API_BASE_URL ||
                        'http://192.168.1.3:3001'; // Default to current known good IP
        console.warn('[MEDIA_URL_FIX] Request has old IP in host header, using fallback:', { 
          requestHost: baseUrl, 
          fallback 
        });
        return normalizePublicOrigin(fallback.replace(/\/+$/, ''));
      }
    }
    
    return normalizePublicOrigin(baseUrl);
  }
  
  // Fallback (shouldn't happen in normal operation)
  return 'http://192.168.1.3:3001'; // Default to current known good IP
}

/**
 * Normalize a single media URL
 * 
 * - If url starts with any OLD_HOSTS[i], replace that prefix with coreBaseUrl
 * - If url starts with '/uploads/' or '/assets/', prefix with coreBaseUrl
 * - Otherwise return url unchanged
 * 
 * @param {string|null|undefined} url - URL to normalize
 * @param {string} coreBaseUrl - Current core base URL
 * @returns {string|null|undefined} Normalized URL or original value if not a string
 */
export function normalizeMediaUrl(url, coreBaseUrl) {
  // Return as-is if falsy or not a string
  if (!url || typeof url !== 'string') {
    return url;
  }

  let newUrl = url;
  if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
    newUrl = normalizePublicOrigin(newUrl);
  }
  let wasModified = false;

  // Check if URL starts with any old host
  for (const oldHost of OLD_HOSTS) {
    if (url.startsWith(oldHost)) {
      // Replace old host with new base URL
      newUrl = url.replace(oldHost, coreBaseUrl);
      wasModified = true;
      break; // Only replace once
    }
  }

  // If not modified yet, check if it's a relative path that needs prefixing
  if (!wasModified) {
    if (url.startsWith('/uploads/') || url.startsWith('/assets/')) {
      newUrl = `${coreBaseUrl}${url}`;
      wasModified = true;
    }
  }

  // Log if we modified the URL
  if (wasModified && newUrl !== url) {
    console.warn('[MEDIA_URL_FIX]', { from: url, to: newUrl });
  }

  return newUrl;
}

/**
 * Normalize URL fields in a media object
 * 
 * Normalizes these fields if present:
 * - url
 * - originalUrl
 * - normalizedUrl
 * - safeUrl
 * - thumbnailUrl
 * - previewUrl
 * - screenshotUrl
 * - optimizedUrl (for Media model)
 * 
 * @param {object} obj - Object to normalize (will be cloned, not mutated)
 * @param {string} coreBaseUrl - Current core base URL
 * @returns {object} New object with normalized URLs
 */
export function normalizeMediaObject(obj, coreBaseUrl) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  // Clone the object to avoid mutating the original
  const normalized = { ...obj };

  // List of URL fields to normalize
  const urlFields = [
    'url',
    'originalUrl',
    'normalizedUrl',
    'safeUrl',
    'thumbnailUrl',
    'previewUrl',
    'screenshotUrl',
    'optimizedUrl',
    'videoSrc', // Also normalize videoSrc if present
    'chosenSrc', // Also normalize chosenSrc if present
  ];

  // Normalize each URL field if present
  for (const field of urlFields) {
    if (normalized[field]) {
      const originalValue = normalized[field];
      const normalizedValue = normalizeMediaUrl(originalValue, coreBaseUrl);
      if (normalizedValue !== originalValue) {
        normalized[field] = normalizedValue;
      }
    }
  }

  // Also normalize nested media/asset objects if present
  if (normalized.media && typeof normalized.media === 'object') {
    normalized.media = normalizeMediaObject(normalized.media, coreBaseUrl);
  }

  if (normalized.asset && typeof normalized.asset === 'object') {
    normalized.asset = normalizeMediaObject(normalized.asset, coreBaseUrl);
  }

  if (normalized.video && typeof normalized.video === 'object') {
    normalized.video = normalizeMediaObject(normalized.video, coreBaseUrl);
  }

  return normalized;
}

/**
 * Normalize playlist items array
 * 
 * Maps over an array of playlist items, normalizing:
 * - item.url
 * - item.media, item.asset, or item.video nested objects via normalizeMediaObject
 * 
 * @param {Array} items - Array of playlist items
 * @param {string} coreBaseUrl - Current core base URL
 * @returns {Array} New array with normalized items
 */
export function normalizePlaylistItems(items, coreBaseUrl) {
  if (!Array.isArray(items)) {
    return items;
  }

  return items.map(item => {
    if (!item || typeof item !== 'object') {
      return item;
    }

    // Clone item
    const normalized = { ...item };

    // Normalize top-level url field
    if (normalized.url) {
      normalized.url = normalizeMediaUrl(normalized.url, coreBaseUrl);
    }

    // Normalize nested media/asset/video objects
    if (normalized.media) {
      normalized.media = normalizeMediaObject(normalized.media, coreBaseUrl);
    }

    if (normalized.asset) {
      normalized.asset = normalizeMediaObject(normalized.asset, coreBaseUrl);
    }

    if (normalized.video) {
      normalized.video = normalizeMediaObject(normalized.video, coreBaseUrl);
    }

    return normalized;
  });
}

/**
 * Testing Checklist (for manual verification):
 * 
 * 1. Seed (or keep) at least one media record with originalUrl starting with
 *    'http://192.168.1.12:3001'.
 * 
 * 2. Call:
 *    - GET /api/asset-library/media (or equivalent asset/media list endpoint)
 *    - GET /api/device/<deviceId>/playlist/full
 * 
 * 3. Verify responses now return URLs starting with 'http://192.168.1.3:3001'
 *    (or current core base URL).
 * 
 * 4. Confirm that the dashboard ScreenPreview and device player can load and
 *    play the videos with no "Skipping previously failed URL" errors.
 */


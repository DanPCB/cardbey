// src/utils/mediaUrlNormalizer.js

import { normalizePublicOrigin } from "./publicUrl.js";

const OLD_HOSTS = [
  "http://192.168.1.12:3001",
  "http://192.168.1.7:3001",
];

/**
 * Get the current core base URL from request or environment
 * 
 * @param {express.Request} req - Express request object
 * @returns {string|null} Core base URL (e.g., "http://192.168.1.3:3001") or null
 */
export function getCoreBaseUrl(req) {
  // Same rule as getBaseUrlFromRequest: incoming Host wins for LAN / multi-homed API.
  if (req) {
    const forwardedProto = req.get?.("X-Forwarded-Proto");
    const proto = forwardedProto || req.protocol || "http";
    const host =
      req.get?.("X-Forwarded-Host") || req.get?.("host") || req.headers?.host || "";
    if (host) {
      return normalizePublicOrigin(`${proto}://${host}`.replace(/\/+$/, ""));
    }
  }
  if (process.env.CORE_BASE_URL) {
    return normalizePublicOrigin(process.env.CORE_BASE_URL.replace(/\/+$/, ""));
  }
  return null;
}

/**
 * Normalize a single URL string.
 * - Fixes "http/192.168..." -> "http://192.168..."
 * - Rewrites old hosts to current base URL
 * - Prefixes bare paths ("/uploads/...") with current base URL
 * 
 * @param {string|null|undefined} raw - Raw URL to normalize
 * @param {string} coreBaseUrl - Current core base URL
 * @returns {string|null|undefined} Normalized URL or original value if not a string
 */
export function normalizeMediaUrl(raw, coreBaseUrl) {
  if (!raw || typeof raw !== "string") return raw;
  let url = raw.trim();
  if (!url) return url;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    url = normalizePublicOrigin(url);
  }

  // 1) Fix "http/192.168..." malformed scheme
  if (url.startsWith("http/")) {
    url = "http://" + url.slice("http/".length);
  }

  // 2) If starts with an old host, replace prefix
  for (const oldHost of OLD_HOSTS) {
    if (url.startsWith(oldHost)) {
      url = coreBaseUrl + url.slice(oldHost.length);
      break;
    }
  }

  // 3) If it's a bare path starting with "/uploads" or "/assets", prefix base
  if (url.startsWith("/uploads/") || url.startsWith("/assets/")) {
    url = coreBaseUrl + url;
  }

  return url;
}

/**
 * Deeply normalizes URLs inside playlist/media-style objects.
 * This helper understands common fields:
 *  - url
 *  - originalUrl, normalizedUrl, safeUrl
 *  - media.url, asset.url, video.url, thumbnailUrl
 * 
 * @param {object} obj - Object to normalize (will be cloned, not mutated)
 * @param {string} coreBaseUrl - Current core base URL
 * @returns {object} New object with normalized URLs
 */
export function normalizeMediaObject(obj, coreBaseUrl) {
  if (!obj || typeof obj !== "object") return obj;

  const clone = { ...obj };

  // common top-level url fields
  if (clone.url) clone.url = normalizeMediaUrl(clone.url, coreBaseUrl);
  if (clone.originalUrl) clone.originalUrl = normalizeMediaUrl(clone.originalUrl, coreBaseUrl);
  if (clone.normalizedUrl) clone.normalizedUrl = normalizeMediaUrl(clone.normalizedUrl, coreBaseUrl);
  if (clone.safeUrl) clone.safeUrl = normalizeMediaUrl(clone.safeUrl, coreBaseUrl);
  if (clone.thumbnailUrl) clone.thumbnailUrl = normalizeMediaUrl(clone.thumbnailUrl, coreBaseUrl);

  // nested structures often used in our project
  if (clone.media && typeof clone.media === "object") {
    clone.media = normalizeMediaObject(clone.media, coreBaseUrl);
  }
  if (clone.asset && typeof clone.asset === "object") {
    clone.asset = normalizeMediaObject(clone.asset, coreBaseUrl);
  }
  if (clone.video && typeof clone.video === "object") {
    clone.video = normalizeMediaObject(clone.video, coreBaseUrl);
  }

  return clone;
}

/**
 * Normalize playlist items array
 * 
 * @param {Array} items - Array of playlist items
 * @param {string} coreBaseUrl - Current core base URL
 * @returns {Array} New array with normalized items
 */
export function normalizePlaylistItems(items, coreBaseUrl) {
  if (!Array.isArray(items)) return items;
  return items.map(item => normalizeMediaObject(item, coreBaseUrl));
}

/**
 * Testing Checklist (for manual verification):
 * 
 * 1. Create an asset with old host 192.168.1.12:
 *    - Either via database directly or through upload endpoint
 *    - Ensure the URL field contains "http://192.168.1.12:3001/uploads/..."
 * 
 * 2. Call playlist/media endpoints:
 *    - GET /api/device/:deviceId/playlist/full
 *    - GET /api/signage-assets (asset library)
 *    - GET /api/uploads/mine (media library)
 * 
 * 3. Verify URLs now use current base URL:
 *    - Check response JSON - URLs should start with current base (e.g., "http://192.168.1.3:3001")
 *    - Old host "192.168.1.12:3001" should be replaced
 * 
 * 4. Confirm AssetLibraryPane warnings disappear:
 *    - Open dashboard Asset Library
 *    - Check browser console - "[AssetLibraryPane] Video failed to load - URL points to different IP" warnings should be gone
 *    - Videos should load and play correctly
 */




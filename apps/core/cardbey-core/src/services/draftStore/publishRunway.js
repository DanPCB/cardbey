/**
 * Unified publish runway — logging and entrypoint contract.
 * All store/website publish flows should call publishDraft() with a known entrypoint.
 */

import { sanitizeStoreSlogan } from '../../lib/contentResolution/sanitizeStoreSlogan.js';

const RUNWAY_ENTRYPOINTS = new Set([
  'performer_tool',
  'mini_website_modal',
  'stores_api_publish',
  'automation',
  'orchestra_auto_publish',
  'draft_commit',
]);

/**
 * @param {string} event
 * @param {Record<string, unknown>} payload
 */
export function logPublishRunway(event, payload = {}) {
  if (process.env.NODE_ENV === 'test' && !process.env.PUBLISH_RUNWAY_LOG_IN_TEST) return;
  console.log(`[${event}]`, payload);
}

/**
 * @param {string} entrypoint
 * @param {Record<string, unknown>} meta
 */
export function logPublishEntry(entrypoint, meta = {}) {
  const runway = RUNWAY_ENTRYPOINTS.has(entrypoint) ? 'unified' : 'unknown';
  logPublishRunway('PUBLISH_ENTRYPOINT', { entrypoint, runway, ...meta });
  logPublishRunway('PUBLISH_RUNWAY', { entrypoint, runway });
}

/**
 * @param {Record<string, unknown>} target
 */
export function logPublishCanonicalTarget(target) {
  logPublishRunway('PUBLISH_CANONICAL_TARGET', target);
}

/**
 * @param {string} legacyPath
 * @param {Record<string, unknown>} [meta]
 */
export function warnLegacyPublishBypass(legacyPath, meta = {}) {
  logPublishRunway('LEGACY_PUBLISH_BYPASS_BLOCKED', { legacyPath, ...meta });
}

/**
 * Copy tagline + description from draft preview for Business row sync.
 * @param {object} rawPreview
 * @param {object} [preview] parsed preview
 */
export function resolvePublishedStoreCopyFromPreview(rawPreview, preview = null) {
  const meta =
    rawPreview?.meta && typeof rawPreview.meta === 'object' ? rawPreview.meta : {};
  const p = preview || rawPreview || {};
  const rawTagline =
    (typeof p.tagline === 'string' && p.tagline.trim()) ||
    (typeof p.slogan === 'string' && p.slogan.trim()) ||
    (typeof meta.tagline === 'string' && meta.tagline.trim()) ||
    '';
  const cleaned = sanitizeStoreSlogan(rawTagline, 160);
  const tagline = cleaned || null;
  const description =
    (typeof p.description === 'string' && p.description.trim()) ||
    (typeof p.heroText === 'string' && p.heroText.trim()) ||
    tagline ||
    null;
  return { tagline, description };
}

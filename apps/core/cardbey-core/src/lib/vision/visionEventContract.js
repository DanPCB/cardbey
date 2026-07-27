/**
 * Vision intake event contract — shared shape for classifier, router, and episodic memory.
 */

import { randomUUID } from 'node:crypto';

/** @typedef {'photo'|'code'|'document'} VisionCaptureMode */
/** @typedef {'chat'|'dashboard'|'feed'|'mission'|'share'|'unknown'} VisionSurface */
/** @typedef {'store_sign'|'flyer_menu'|'product_photo'|'qr_payload'|'receipt'|'unknown'} VisionIntent */

/**
 * @typedef {Object} VisionLocation
 * @property {number} lat
 * @property {number} lng
 * @property {'exif'|'client'|'vision'|null} source
 */

/**
 * @typedef {Object} VisionExtraction
 * @property {string|null} [businessName]
 * @property {string|null} [tagline]
 * @property {string|null} [category]
 * @property {string[]} [brandColors]
 * @property {string|null} [visibleAddress]
 * @property {string|null} [visiblePhone]
 * @property {Array<object>} [products]
 * @property {string|null} [notes]
 */

/**
 * @typedef {Object} VisionEvent
 * @property {string} id
 * @property {VisionCaptureMode} captureMode
 * @property {VisionSurface} surface
 * @property {string|null} userId
 * @property {string|null} storeIdHint
 * @property {string|null} decodedPayload
 * @property {string[]} imagePaths
 * @property {VisionLocation|null} location
 * @property {VisionIntent} intent
 * @property {number} intentConfidence
 * @property {VisionExtraction} extraction
 */

const VALID_SURFACES = new Set(['chat', 'dashboard', 'feed', 'mission', 'share', 'unknown']);
const VALID_INTENTS = new Set([
  'store_sign',
  'flyer_menu',
  'product_photo',
  'qr_payload',
  'receipt',
  'unknown',
]);

/**
 * @param {unknown} value
 * @returns {VisionSurface}
 */
export function normalizeVisionSurface(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_SURFACES.has(s) ? /** @type {VisionSurface} */ (s) : 'unknown';
}

/**
 * @param {unknown} value
 * @returns {VisionIntent}
 */
export function normalizeVisionIntent(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_INTENTS.has(s) ? /** @type {VisionIntent} */ (s) : 'unknown';
}

/**
 * @param {object} [params]
 * @returns {VisionEvent}
 */
export function createVisionEvent(params = {}) {
  const imageCount = Array.isArray(params.imagePaths) ? params.imagePaths.length : 0;
  const hasCode = Boolean(String(params.decodedPayload ?? '').trim());
  /** @type {VisionCaptureMode} */
  const captureMode = hasCode && imageCount === 0
    ? 'code'
    : imageCount > 1
      ? 'document'
      : 'photo';

  return {
    id: typeof params.id === 'string' && params.id.trim() ? params.id.trim() : randomUUID(),
    captureMode,
    surface: normalizeVisionSurface(params.surface),
    userId: typeof params.userId === 'string' && params.userId.trim() ? params.userId.trim() : null,
    storeIdHint:
      typeof params.storeIdHint === 'string' && params.storeIdHint.trim()
        ? params.storeIdHint.trim()
        : null,
    decodedPayload:
      typeof params.decodedPayload === 'string' && params.decodedPayload.trim()
        ? params.decodedPayload.trim()
        : null,
    imagePaths: Array.isArray(params.imagePaths)
      ? params.imagePaths.map((p) => String(p ?? '').trim()).filter(Boolean)
      : [],
    location: params.location && typeof params.location === 'object' ? params.location : null,
    intent: normalizeVisionIntent(params.intent ?? 'unknown'),
    intentConfidence:
      typeof params.intentConfidence === 'number' && Number.isFinite(params.intentConfidence)
        ? Math.max(0, Math.min(1, params.intentConfidence))
        : 0,
    extraction:
      params.extraction && typeof params.extraction === 'object' && !Array.isArray(params.extraction)
        ? params.extraction
        : {},
  };
}

/**
 * @param {unknown} extraction
 * @returns {VisionExtraction}
 */
export function normalizeVisionExtraction(extraction) {
  const raw = extraction && typeof extraction === 'object' && !Array.isArray(extraction) ? extraction : {};
  return {
    businessName: raw.businessName != null ? String(raw.businessName).trim() || null : null,
    tagline: raw.tagline != null ? String(raw.tagline).trim() || null : null,
    category: raw.category != null ? String(raw.category).trim() || null : null,
    brandColors: Array.isArray(raw.brandColors)
      ? raw.brandColors.map((c) => String(c ?? '').trim()).filter(Boolean)
      : [],
    visibleAddress:
      raw.visibleAddress != null ? String(raw.visibleAddress).trim() || null : null,
    visiblePhone: raw.visiblePhone != null ? String(raw.visiblePhone).trim() || null : null,
    products: Array.isArray(raw.products) ? raw.products : [],
    notes: raw.notes != null ? String(raw.notes).trim() || null : null,
  };
}

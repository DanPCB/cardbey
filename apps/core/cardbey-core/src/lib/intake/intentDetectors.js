/**
 * Intent detectors for Performer NL consolidation — graphic, loyalty, and related fast-paths.
 * Single source for phrase matching used by IntentReasoner and assetUploadGuard.
 */

import {
  isPromotionGraphicIntent,
  detectPromotionGraphicIntent,
} from './intakeSystemShortcuts.js';

export { isPromotionGraphicIntent, detectPromotionGraphicIntent };

const GRAPHIC_DESIGN_PATTERNS = [
  /\b(graphic|visual|design|poster|banner|flyer|artwork|creative)\b/i,
  /\bcreate\s+a?\s*(design|visual|graphic)\b/i,
  /\bgenerate\s+a?\s*(design|visual|graphic)\b/i,
  /\bmake\s+a?\s*(design|visual|graphic)\b/i,
  /\bmarketing\s*(graphic|visual|image)\b/i,
  /\bbrand\s*(graphic|visual|image)\b/i,
  /\bsocial\s*(graphic|visual|poster)\b/i,
  /\b(promotion|promo)\s*(graphic|image|visual|banner|poster)\b/i,
  /\bgraphic\s*for\s*(promotion|store|collection)\b/i,
  /\b(spring|summer|autumn|winter|new)\s+collection\b[\s\S]{0,40}\b(graphic|promotion|promo)\b/i,
];

const DOCUMENT_INGEST_EXCLUSION =
  /\b(read|scan|ingest|extract|import|upload)\b[\s\S]{0,24}\b(flyer|document|brochure|menu|catalog|card)\b/i;

const LOYALTY_PATTERNS = [
  /\bloyalty\s+program\b/i,
  /\bsetup\s+loyalty\b/i,
  /\brewards?\s+program\b/i,
  /\bstamp\s+card\b/i,
  /\bcustomer\s+loyalty\b/i,
  /\bpoints\s+program\b/i,
  /\bmember\s+rewards?\b/i,
];

/**
 * Broader graphic/design intent — excludes explicit document-ingest phrasing.
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isGraphicDesignIntent(text) {
  const msg = String(text ?? '').trim();
  if (!msg) return false;
  if (DOCUMENT_INGEST_EXCLUSION.test(msg)) return false;
  return GRAPHIC_DESIGN_PATTERNS.some((p) => p.test(msg));
}

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isLoyaltyIntent(text) {
  const msg = String(text ?? '').trim();
  if (!msg) return false;
  return LOYALTY_PATTERNS.some((p) => p.test(msg));
}

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isGraphicOrPromotionIntent(text) {
  return isPromotionGraphicIntent(text) || isGraphicDesignIntent(text);
}

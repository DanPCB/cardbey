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
  /\bloyalty\s*program\b/i,
  /\bloyalty\s*campaign\b/i,
  /\bloyalty\s*card\b/i,
  /\bdigital\s+loyalty\b/i,
  /\breward\s+card\b/i,
  /\bpunch\s*card\b/i,
  /\bstamp\s*card\b/i,
  /\bsetup\s+(?:a\s+)?loyalty\b/i,
  /\bcreate\s+(?:a\s+)?loyalty\b/i,
  /\bmake\s+(?:a\s+)?loyalty\b/i,
  /\bturn\s+.{0,40}\bstamp\s*card\b/i,
  /\brewards?\s+program\b/i,
  /\breward\s+program\b/i,
  /\bloyalty\s+reward\b/i,
  /\bcustomer\s+loyalty\b/i,
  /\bpoints\s+program\b/i,
  /\bmember\s+(program|rewards?)\b/i,
];

/**
 * Explicit marketing-asset language that should keep create_campaign even when loyalty terms appear.
 * e.g. "poster campaign advertising my loyalty program", "social posts to promote my loyalty card"
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isExplicitLoyaltyMarketingCampaign(text) {
  const msg = String(text ?? '').trim();
  if (!msg) return false;
  const hasLoyaltyMention =
    /\bloyalty\b/i.test(msg) ||
    /\bstamp\s*card\b/i.test(msg) ||
    /\breward\s+card\b/i.test(msg) ||
    /\bpunch\s*card\b/i.test(msg);
  if (!hasLoyaltyMention) return false;
  return (
    /\b(poster|slideshow|banner|flyer)\b/i.test(msg) ||
    /\bsocial\s+media\b/i.test(msg) ||
    /\b(advertise|advertising|promote|promoting|promotion\s+of)\b/i.test(msg) ||
    /\blaunch\s+(?:a\s+)?marketing\s+campaign\b/i.test(msg) ||
    /\bmarketing\s+campaign\b/i.test(msg) ||
    /\bposts?\s+to\s+promote\b/i.test(msg)
  );
}

/**
 * Loyalty setup intent should win over generic create_campaign when loyalty/card context is present,
 * unless the user explicitly asks for marketing assets promoting loyalty.
 * @param {string | null | undefined} text
 * @param {{ artifactType?: string } | null | undefined} [attachmentAnalysis]
 * @returns {boolean}
 */
export function shouldPreferLoyaltyOverCampaign(text, attachmentAnalysis = null) {
  if (isExplicitLoyaltyMarketingCampaign(text)) return false;
  if (isLoyaltyIntent(text)) return true;
  const artifactType = String(attachmentAnalysis?.artifactType ?? '').trim().toLowerCase();
  // Tie-breaker: scanned loyalty card → loyalty program unless explicit marketing language above.
  if (artifactType === 'loyalty_card') return true;
  return false;
}

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

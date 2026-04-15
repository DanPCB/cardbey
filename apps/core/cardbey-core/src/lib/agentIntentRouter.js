/**
 * Lightweight intent routing for agent messages (minimum viable).
 * Used to: skip OCR for MARKETING/FIX_IMAGE_MISMATCH; route FIX_IMAGE_MISMATCH to ops flow.
 * BUSINESS_CARD_OCR and UNKNOWN keep current behavior (OCR when image present).
 */

export const INTENT_MARKETING = 'MARKETING';
export const INTENT_FIX_IMAGE_MISMATCH = 'FIX_IMAGE_MISMATCH';
export const INTENT_BUSINESS_CARD_OCR = 'BUSINESS_CARD_OCR';
export const INTENT_UNKNOWN = 'UNKNOWN';

const MARKETING_PHRASES = ['marketing plan', 'campaign', 'content', 'schedule'];
const FIX_IMAGE_PHRASES = ['fix image', 'image mismatch', 'wrong image', 'rebind'];
const BUSINESS_CARD_PHRASES = ['business card', 'extract', 'phone', 'address', 'ocr'];

/**
 * Classify user message intent from text (case-insensitive).
 * First match wins; order: FIX_IMAGE_MISMATCH, MARKETING, BUSINESS_CARD_OCR, else UNKNOWN.
 * @param {string} text - User message
 * @returns {string} INTENT_*
 */
export function classifyIntent(text) {
  const t = (typeof text === 'string' ? text : '').trim().toLowerCase();
  if (!t) return INTENT_UNKNOWN;
  if (FIX_IMAGE_PHRASES.some((p) => t.includes(p))) return INTENT_FIX_IMAGE_MISMATCH;
  if (MARKETING_PHRASES.some((p) => t.includes(p))) return INTENT_MARKETING;
  if (BUSINESS_CARD_PHRASES.some((p) => t.includes(p))) return INTENT_BUSINESS_CARD_OCR;
  return INTENT_UNKNOWN;
}

/**
 * Parse entityType and entityId from message text or metadata.
 * Looks for: "draftStore <id>", "draft <id>", "store <id>", "DraftStore <id>", etc.
 * Metadata can pass { entityType: 'DraftStore'|'Store', entityId: string }.
 * @param {string} text - User message
 * @param {object} [metadata] - Optional payload/metadata with entityType, entityId
 * @returns {{ entityType: string, entityId: string } | null}
 */
export function parseEntityFromMessage(text, metadata) {
  if (metadata && typeof metadata === 'object') {
    const et = metadata.entityType && (metadata.entityType === 'DraftStore' || metadata.entityType === 'Store') ? metadata.entityType : null;
    const id = typeof metadata.entityId === 'string' && metadata.entityId.trim() ? metadata.entityId.trim() : null;
    if (et && id) return { entityType: et, entityId: id };
  }
  const t = (typeof text === 'string' ? text : '').trim();
  const draftStoreMatch = t.match(/(?:draftstore|draft\s+store|draft)\s+([a-zA-Z0-9-_]+)/i);
  if (draftStoreMatch) return { entityType: 'DraftStore', entityId: draftStoreMatch[1].trim() };
  const storeMatch = t.match(/(?:store)\s+([a-zA-Z0-9-_]+)/i);
  if (storeMatch) return { entityType: 'Store', entityId: storeMatch[1].trim() };
  return null;
}

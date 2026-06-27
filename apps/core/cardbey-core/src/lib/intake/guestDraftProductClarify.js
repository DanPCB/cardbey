/**
 * Guest draft store — vague "add product" should clarify details, not restart store creation or sign-in.
 */

import { hasGuestStoreBuildContext, isGuestIntakeActor } from './guestDraftSignInGate.js';

/**
 * @param {string} message
 */
export function isAddProductCatalogIntent(message) {
  const m = String(message ?? '').trim().toLowerCase();
  if (!m) return false;
  return (
    /\badd\s+(a\s+)?product\b/.test(m) ||
    /\b(add|import|upload|update|replace|refresh)\b.{0,32}\b(product|products|item|items|menu|catalog|catalogue)\b/i.test(
      m,
    )
  );
}

/**
 * @param {string} message
 * @param {{ hasAttachment?: boolean }} [opts]
 */
export function isVagueAddProductMessage(message, opts = {}) {
  if (opts.hasAttachment) return false;
  const m = String(message ?? '').trim();
  if (!m) return true;
  if (!isAddProductCatalogIntent(m)) return false;
  if (/\bto\s+my\s+(store|shop|catalog)\b/i.test(m)) return false;
  if (/\bto\s+(the\s+)?(store|shop|catalog)\b/i.test(m)) return false;
  if (/\$[\d,.]+|\b\d+(\.\d{2})?\s*(aud|usd|eur|gbp|vnd)?\b/i.test(m)) return false;
  if (/\b(sku|item\s*#|product\s*name|ingredients|description|size|variant)\b/i.test(m)) return false;
  if (m.split(/\s+/).length > 20) return false;
  return true;
}

/**
 * @param {{
 *   req: import('express').Request;
 *   effectiveStoreId?: string | null;
 *   draftId?: string | null;
 *   runway?: { activeDraftId?: string | null } | null;
 *   userMessage?: string | null;
 *   hasAttachment?: boolean;
 *   tool?: string | null;
 * }} args
 */
export function shouldClarifyGuestDraftAddProduct({
  req,
  effectiveStoreId,
  draftId,
  runway,
  missionId,
  userMessage,
  hasAttachment = false,
  tool,
}) {
  if (!isGuestIntakeActor(req)) return false;
  if (!hasGuestStoreBuildContext({ draftId, runway, effectiveStoreId, missionId })) return false;
  if (String(tool ?? '').trim() === 'create_store') return false;
  const msg = String(userMessage ?? '').trim();
  if (!isAddProductCatalogIntent(msg)) return false;
  return isVagueAddProductMessage(msg, { hasAttachment });
}

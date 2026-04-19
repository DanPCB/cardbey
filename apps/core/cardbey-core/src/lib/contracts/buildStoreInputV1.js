/**
 * Phase 1 — build canonical BuildStoreInputV1 fields for OrchestratorTask.request / shared factory alignment.
 * Pure helpers; no Prisma.
 */

import { inferCurrencyFromLocationText } from '../../services/draftStore/currencyInfer.js';

/**
 * @param {{
 *   businessName?: string | null,
 *   businessType?: string | null,
 *   storeType?: string | null,
 *   location?: string | null,
 *   intentMode?: string | null,
 *   rawInput?: string | null,
 *   rawUserText?: string | null,
 *   currencyCode?: string | null,
 *   sourceType?: string | null,
 *   websiteUrl?: string | null,
 *   preloadedCatalogItems?: unknown[] | null,
 * }} p
 * @returns {Record<string, unknown> | null} BuildStoreInputV1-shaped object, or null if businessName missing
 */
export function composeBuildStoreInputV1FromFields(p) {
  const bn = typeof p.businessName === 'string' ? p.businessName.trim() : '';
  if (!bn) return null;

  const bt =
    typeof p.businessType === 'string' && p.businessType.trim() ? p.businessType.trim() : 'Other';
  const st =
    typeof p.storeType === 'string' && p.storeType.trim()
      ? p.storeType.trim()
      : bt;

  const locRaw = p.location != null && String(p.location).trim() ? String(p.location).trim() : '';

  let im = 'store';
  if (p.intentMode != null && String(p.intentMode).trim()) {
    const low = String(p.intentMode).trim().toLowerCase();
    if (low === 'website' || low === 'store') im = low;
  }

  let text = '';
  if (typeof p.rawUserText === 'string' && p.rawUserText.trim()) text = p.rawUserText.trim();
  else if (typeof p.rawInput === 'string' && p.rawInput.trim()) text = p.rawInput.trim();

  let cc = null;
  if (p.currencyCode != null && String(p.currencyCode).trim()) {
    cc = String(p.currencyCode).trim().toUpperCase();
  } else {
    cc = inferCurrencyFromLocationText(locRaw) || inferCurrencyFromLocationText(bn) || 'AUD';
  }

  /** @type {Record<string, unknown>} */
  const out = {
    schemaVersion: 1,
    businessName: bn,
    businessType: bt,
    storeType: st,
    intentMode: im,
    currencyCode: cc,
  };
  if (locRaw) out.location = locRaw;
  if (text) out.rawUserText = text;
  if (p.sourceType != null && String(p.sourceType).trim()) {
    out.sourceType = String(p.sourceType).trim();
  }
  if (p.websiteUrl != null && String(p.websiteUrl).trim()) {
    out.websiteUrl = String(p.websiteUrl).trim();
  }
  if (Array.isArray(p.preloadedCatalogItems) && p.preloadedCatalogItems.length) {
    out.preloadedCatalogItems = p.preloadedCatalogItems;
  }
  return out;
}

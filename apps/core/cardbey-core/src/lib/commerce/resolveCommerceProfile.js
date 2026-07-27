/**
 * Resolve authoritative BusinessCommerceProfile before catalog generation.
 */

import { buildBusinessProfile } from '../businessSemantic/BusinessProfileBuilder.js';
import { resolveCommerceMode } from '../storeTransactionMode.js';
import { inferCurrencyFromLocationText } from '../../services/draftStore/currencyInfer.js';

const HANDYMAN_RE = /\b(handyman|handy[\s-]?man|ca\s+handyman)\b/i;
const SERVICE_RE =
  /\b(handyman|plumb|electric|clean|repair|maintenance|contractor|trades|tiling|flooring|painting|landscap)\b/i;

/**
 * @param {import('./commerceProfileTypes.js').BusinessCommerceProfile} profile
 */
export function logCommerceProfileResolved(profile) {
  console.log('[CommerceProfileResolver] classified business', {
    businessKind: profile.businessKind,
    catalogKind: profile.catalogKind,
    transactionMode: profile.transactionMode,
    pricingMode: profile.pricingMode,
    confidence: profile.confidence,
    currencyCode: profile.currencyCode,
    evidence: profile.evidence?.slice(0, 5),
  });
}

/**
 * @param {object} input
 * @returns {import('./commerceProfileTypes.js').BusinessCommerceProfile}
 */
export function resolveCommerceProfile(input = {}) {
  const evidence = [];
  const businessName = String(input.businessName ?? input.storeName ?? '').trim();
  const storeType = String(input.storeType ?? input.businessType ?? input.category ?? '').trim();
  const verticalSlug = String(input.verticalSlug ?? '').toLowerCase().trim();
  const verticalGroup = String(input.verticalGroup ?? verticalSlug.split('.')[0] ?? '').toLowerCase();
  const location = String(input.location ?? '').trim();
  const prompt = String(input.prompt ?? '').trim();
  const corpus = [businessName, storeType, verticalSlug, prompt, location].filter(Boolean).join(' ');

  const bsl = buildBusinessProfile({
    businessName,
    category: storeType,
    businessType: storeType,
    storeType,
    prompt,
    location,
    items: input.items,
  });
  const bp = bsl.profile;

  let businessKind = 'retail';
  let catalogKind = 'product';
  let transactionMode = 'checkout';
  let pricingMode = 'fixed';
  let confidence = bp.metadata?.confidence ?? 0.7;

  if (bp.businessType === 'food_menu' || bp.commerceType === 'food') {
    businessKind = 'hospitality';
    catalogKind = 'menu_item';
    transactionMode = 'checkout';
    pricingMode = 'fixed';
    evidence.push('bsl:food_menu');
  } else if (
    bp.businessType === 'service_fixed_booking' ||
    bp.businessType === 'service_quote_required' ||
    bp.commerceType === 'service'
  ) {
    businessKind = 'service';
    catalogKind = 'service';
    transactionMode = bp.businessType === 'service_quote_required' ? 'quote' : 'booking';
    pricingMode = bp.businessType === 'service_quote_required' ? 'quote_required' : 'starting_from';
    evidence.push(`bsl:${bp.businessType}`);
  } else if (bp.businessType === 'hybrid' || bp.commerceType === 'hybrid') {
    businessKind = 'hybrid';
    catalogKind = 'mixed';
    transactionMode = 'mixed';
    pricingMode = 'mixed';
    evidence.push('bsl:hybrid');
  }

  if (verticalGroup === 'services' || verticalSlug.startsWith('services.')) {
    businessKind = 'service';
    catalogKind = 'service';
    transactionMode = transactionMode === 'checkout' ? 'booking' : transactionMode;
    pricingMode = pricingMode === 'fixed' ? 'starting_from' : pricingMode;
    evidence.push(`vertical:${verticalSlug || verticalGroup}`);
  }

  if (HANDYMAN_RE.test(businessName) || verticalSlug.includes('handyman')) {
    businessKind = 'service';
    catalogKind = 'service';
    transactionMode = 'mixed';
    pricingMode = 'mixed';
    confidence = Math.max(confidence, 0.9);
    evidence.push('handyman:explicit');
  } else if (SERVICE_RE.test(corpus)) {
    if (businessKind === 'retail') {
      businessKind = 'service';
      catalogKind = 'service';
      transactionMode = 'quote';
      pricingMode = 'quote_required';
      evidence.push('corpus:service_signals');
    }
  }

  const commerceMode = resolveCommerceMode(storeType, { commerceMode: input.commerceMode });
  if (commerceMode === 'booking' && catalogKind === 'product') {
    catalogKind = 'service';
    businessKind = 'service';
    transactionMode = 'booking';
    evidence.push('commerceMode:booking');
  } else if (commerceMode === 'inquiry' && catalogKind === 'product') {
    catalogKind = 'service';
    businessKind = 'service';
    transactionMode = 'quote';
    pricingMode = 'quote_required';
    evidence.push('commerceMode:inquiry');
  }

  const currencyCode =
    (input.currencyCode && String(input.currencyCode).trim().toUpperCase()) ||
    inferCurrencyFromLocationText(location) ||
    'AUD';

  /** @type {import('./commerceProfileTypes.js').BusinessCommerceProfile} */
  const profile = {
    businessKind,
    catalogKind,
    transactionMode,
    pricingMode,
    confidence,
    evidence,
    currencyCode,
    verticalSlug: verticalSlug || undefined,
  };

  logCommerceProfileResolved(profile);
  return profile;
}

/**
 * Product-truth destination guard. Never fabricates unavailable routes.
 */

import { Features } from '../../config/features.js';
import { publicWebBase } from '../../utils/publicWebBase.js';
import { isInvestorReservedIntent } from './intentTaxonomy.js';

export const DESTINATION_KEYS = Object.freeze({
  GLOBAL_LIVE: 'global_live',
  CREATE_BUSINESS: 'create_business',
  FOR_SELLERS: 'for_sellers',
  SIGNUP: 'signup',
  HUMAN_FOLLOWUP: 'human_followup',
});

function origin() {
  return String(publicWebBase() || '').replace(/\/+$/, '') || 'http://localhost:5174';
}

function absolute(path) {
  return `${origin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveGlobalLiveAvailability() {
  const enabled = Features.globalLiveEoi?.v1 === true;
  const open = enabled && Features.globalLiveEoi?.open === true;
  return { enabled, open, available: enabled && open };
}

/**
 * @param {{ intent?: string, targetType?: string }} input
 */
export function resolveDestinationForIntent(input = {}) {
  const intent = String(input.intent || 'UNKNOWN');
  const targetType = String(input.targetType || 'USER_ACQUISITION');

  if (isInvestorReservedIntent(intent) || targetType === 'INVESTOR_DISCOVERY') {
    return {
      key: DESTINATION_KEYS.HUMAN_FOLLOWUP,
      available: false,
      path: null,
      url: null,
      reason: 'investor_destination_unavailable',
      note: 'No investor destination is published. Human follow-up only.',
    };
  }

  if (intent === 'GLOBAL_LIVE_EOI') {
    const gl = resolveGlobalLiveAvailability();
    if (!gl.available) {
      return {
        key: DESTINATION_KEYS.GLOBAL_LIVE,
        available: false,
        path: '/global-live',
        url: null,
        reason: gl.enabled ? 'global_live_closed' : 'global_live_disabled',
        note: 'Global Live registration is not open.',
      };
    }
    return {
      key: DESTINATION_KEYS.GLOBAL_LIVE,
      available: true,
      path: '/global-live',
      url: absolute('/global-live'),
      reason: null,
      note: null,
    };
  }

  if (intent === 'CREATE_BUSINESS' || intent === 'SMART_PRODUCT' || intent === 'MARKET_ENTRY') {
    return {
      key: DESTINATION_KEYS.CREATE_BUSINESS,
      available: true,
      path: '/for-business',
      url: absolute('/for-business'),
      reason: null,
      note: null,
    };
  }

  if (intent === 'SELL_PRODUCT' || intent === 'SHOWCASE_SERVICE') {
    return {
      key: DESTINATION_KEYS.FOR_SELLERS,
      available: true,
      path: '/for-sellers',
      url: absolute('/for-sellers'),
      reason: null,
      note: null,
    };
  }

  if (
    intent === 'SUPPLIER_PARTNERSHIP' ||
    intent === 'PARTNERSHIP' ||
    intent === 'GENERAL_INTEREST'
  ) {
    return {
      key: DESTINATION_KEYS.CREATE_BUSINESS,
      available: true,
      path: '/for-business',
      url: absolute('/for-business'),
      reason: null,
      note: null,
    };
  }

  if (intent === 'SUPPORT') {
    return {
      key: DESTINATION_KEYS.HUMAN_FOLLOWUP,
      available: false,
      path: null,
      url: null,
      reason: 'support_no_self_serve_cta',
      note: 'Support stays with human follow-up. No automated outbound.',
    };
  }

  return {
    key: DESTINATION_KEYS.HUMAN_FOLLOWUP,
    available: false,
    path: null,
    url: null,
    reason: 'no_valid_destination',
    note: 'No CTA until a matching Cardbey destination is available.',
  };
}

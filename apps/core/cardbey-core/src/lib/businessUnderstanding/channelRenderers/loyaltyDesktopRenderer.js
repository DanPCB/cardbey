/**
 * Desktop channel renderer — consumes businessUnderstanding.bundle (never raw OCR).
 */

import { composeFromUnderstandingBundle } from '../businessCompositionEngine.js';

/**
 * @param {import('../businessUnderstandingTypes.js').CanonicalUnderstandingBundle} bundle
 * @param {{ progress?: Record<string, unknown>; storeName?: string | null }} [opts]
 */
export function renderLoyaltyDesktopChannel(bundle, opts = {}) {
  const composed = composeFromUnderstandingBundle(bundle, {
    channel: 'desktop',
    progress: opts.progress,
  });

  if (!composed.loyalty?.cardTopology) {
    return {
      ok: false,
      reason: 'LOYALTY_TOPOLOGY_MISSING',
      composed,
    };
  }

  const loyalty = composed.loyalty;
  if (opts.storeName) {
    loyalty.storeName = opts.storeName;
  }

  return {
    ok: true,
    channel: 'desktop',
    rendererMode: 'CONTRACT_DRIVEN',
    payload: {
      programName: loyalty.programName,
      storeName: loyalty.storeName,
      rule: loyalty.rule,
      cardTopology: loyalty.cardTopology,
      cardFooterText: loyalty.footerText,
      theme: loyalty.theme,
      progress: loyalty.progress,
      adaptationMode: bundle.adaptationMode,
      provenance: {
        layout: 'cb-layout',
        businessRule: 'cb-business-rule',
        brand: 'cb-brand',
      },
    },
    composed,
  };
}

export default { renderLoyaltyDesktopChannel };

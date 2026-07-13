/**
 * Phase 12 — Merchant-facing understanding summary (hides dev diagnostics).
 */

/** @typedef {import('./businessUnderstandingTypes.js').CanonicalUnderstandingBundle} CanonicalUnderstandingBundle */
/** @typedef {import('./businessUnderstandingTypes.js').MerchantUnderstandingSummary} MerchantUnderstandingSummary */

const ARTIFACT_LABELS = Object.freeze({
  loyalty_card: 'Loyalty card',
  menu: 'Menu',
  business_card: 'Business card',
  promotion_flyer: 'Promotion flyer',
  poster: 'Poster',
  voucher: 'Voucher',
  coupon: 'Coupon',
  gift_card: 'Gift card',
  price_list: 'Price list',
  product_sheet: 'Product sheet',
  receipt: 'Receipt',
  invoice: 'Invoice',
  event_ticket: 'Event ticket',
  unknown: 'Business document',
});

/**
 * @param {CanonicalUnderstandingBundle} bundle
 * @returns {MerchantUnderstandingSummary}
 */
export function buildMerchantUnderstandingSummary(bundle) {
  const artifactType = bundle.artifact.artifactType;
  const label = ARTIFACT_LABELS[artifactType] ?? ARTIFACT_LABELS.unknown;
  const brandName = bundle.brand?.brandName?.value;
  const ruleSummary = bundle.businessRule?.rawRuleSummary?.value;

  /** @type {MerchantUnderstandingSummary['checkpoints']} */
  const checkpoints = [
    {
      label: `${label} detected`,
      ok: bundle.artifact.classification.confidence >= 0.55,
      detail:
        bundle.artifact.classification.confidence >= 0.85
          ? 'High confidence'
          : 'Review recommended',
    },
    {
      label: 'Brand identified',
      ok: Boolean(brandName),
      detail: brandName ? String(brandName) : undefined,
    },
    {
      label: 'Reward rules extracted',
      ok: Boolean(bundle.businessRule?.earningRule),
      detail: ruleSummary ? String(ruleSummary) : undefined,
    },
    {
      label: 'Brand profile created',
      ok: Boolean(bundle.brand?.visualMood?.value?.length),
    },
    {
      label: artifactType === 'loyalty_card'
        ? 'Digital loyalty program generated'
        : 'Digital asset prepared',
      ok: Boolean(bundle.layout),
    },
  ];

  const readyForReview = checkpoints.filter((c) => c.ok).length >= 3;

  return {
    headline: readyForReview ? 'Ready for review' : 'Review your upload',
    checkpoints,
    readyForReview,
    adaptationMode: bundle.adaptationMode,
  };
}

export default { buildMerchantUnderstandingSummary };

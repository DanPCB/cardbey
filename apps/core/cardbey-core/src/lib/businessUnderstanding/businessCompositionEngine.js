/**
 * Business Understanding composition engine — channel layouts from canonical contracts.
 * AI produces intent/contracts; composition determines render structure (not OCR).
 */

import { buildLoyaltyCardTopologyFromDetected } from '../loyalty/loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyalty/loyaltyRuleInference.js';
import { SUPPORTED_RENDER_CHANNELS } from './compositionModes.js';

/** @typedef {import('./businessUnderstandingTypes.js').CanonicalUnderstandingBundle} CanonicalUnderstandingBundle */
/** @typedef {import('./compositionModes.js').RenderChannel} RenderChannel */

/**
 * @param {import('./businessUnderstandingTypes.js').BrandProfile | null | undefined} brand
 */
export function resolveThemeFromBrandProfile(brand) {
  const primary = brand?.primaryColors?.value?.[0] ?? '#6366f1';
  const secondary = brand?.secondaryColors?.value?.[0] ?? brand?.primaryColors?.value?.[1] ?? '#7c3aed';
  return {
    primaryColor: primary,
    accentColor: secondary,
    gradient: `linear-gradient(145deg, ${primary} 0%, ${secondary} 100%)`,
    typography:
      brand?.typography?.value === 'sans_serif_promotional'
        ? 'system-ui, sans-serif'
        : 'system-ui, sans-serif',
    mood: brand?.visualMood?.value ?? [],
  };
}

/**
 * @param {import('./businessUnderstandingTypes.js').LayoutContract | null | undefined} layout
 * @param {import('./businessUnderstandingTypes.js').BusinessRuleContract | null | undefined} businessRule
 */
export function layoutContractToDetectedGrid(layout, businessRule) {
  if (!layout?.cells?.length) return null;

  const purchaseHint =
    businessRule?.earningRule?.item?.replace(/_/g, ' ') ?? 'Coffee';
  const rewardHint =
    businessRule?.reward?.item?.replace(/_/g, ' ') ?? 'Free';

  return {
    rows: Number(layout.rows) || 1,
    columns: Number(layout.columns) || 1,
    cells: layout.cells.map((cell) => ({
      row: cell.row,
      column: cell.column,
      role: cell.role,
      text:
        cell.label ??
        (cell.role === 'REWARD' ? rewardHint : cell.role === 'PURCHASE' ? purchaseHint : undefined),
      confidence: 0.9,
    })),
    footerText: layout.footerText?.value ?? undefined,
    headerText: layout.headerText?.value ?? undefined,
    overallConfidence: 0.9,
    repeatedPattern:
      layout.rows && layout.columns
        ? {
            direction: 'ROW',
            roles: layout.cells
              .filter((c) => c.row === 0)
              .sort((a, b) => a.column - b.column)
              .map((c) => (c.role === 'REWARD' ? 'REWARD' : 'PURCHASE')),
            repetitions: Number(layout.rows) || 1,
          }
        : undefined,
    purchaseItemHint: purchaseHint,
    rewardItemHint: rewardHint,
  };
}

/**
 * @param {CanonicalUnderstandingBundle} bundle
 */
export function bundleToLoyaltyContracts(bundle) {
  const detected = layoutContractToDetectedGrid(bundle.layout, bundle.businessRule);
  if (!detected) return { cardTopology: null, rule: null };

  const cardTopology = buildLoyaltyCardTopologyFromDetected(detected, {
    source: 'VISION_EXTRACTED',
  });

  let rule = null;
  if (bundle.businessRule?.earningRule && bundle.businessRule?.reward) {
    const earning = bundle.businessRule.earningRule;
    const reward = bundle.businessRule.reward;
    rule = {
      programType: 'STAMP_CARD',
      purchaseItem: earning.item.replace(/_/g, ' '),
      purchasesRequired: earning.required,
      rewardQuantity: reward.quantity,
      rewardItem: reward.item.replace(/_/g, ' '),
      repeatMode: 'INDEFINITE',
    };
  } else if (cardTopology) {
    rule = inferRuleFromTopology(cardTopology, {
      purchaseItem: detected.purchaseItemHint,
      rewardItem: detected.rewardItemHint,
    });
  }

  return { cardTopology, rule };
}

/**
 * @param {CanonicalUnderstandingBundle} bundle
 * @param {{ channel?: RenderChannel; progress?: Record<string, unknown> }} [opts]
 */
export function composeFromUnderstandingBundle(bundle, opts = {}) {
  const channel = SUPPORTED_RENDER_CHANNELS.includes(opts.channel)
    ? opts.channel
    : 'desktop';

  const artifactType = bundle?.artifact?.artifactType ?? 'unknown';
  const theme = resolveThemeFromBrandProfile(bundle.brand);
  const footer =
    bundle.layout?.footerText?.value ??
    bundle.businessRule?.rawRuleSummary?.value ??
    null;

  if (artifactType === 'loyalty_card') {
    const { cardTopology, rule } = bundleToLoyaltyContracts(bundle);
    return {
      channel,
      rendererMode: cardTopology ? 'CONTRACT_DRIVEN' : 'CONTRACT_INCOMPLETE',
      source: 'business_understanding_bundle',
      artifactType,
      loyalty: {
        cardTopology,
        rule,
        footerText: footer,
        theme,
        progress: opts.progress ?? null,
        programName:
          bundle.brand?.brandName?.value != null
            ? `${bundle.brand.brandName.value} Rewards`
            : 'Loyalty Rewards',
        storeName: bundle.brand?.brandName?.value ?? null,
      },
      brand: bundle.brand,
      intent: bundle.intent,
    };
  }

  return {
    channel,
    rendererMode: 'CONTRACT_STRUCTURE',
    source: 'business_understanding_bundle',
    artifactType,
    documentLayout: bundle.layout ?? null,
    businessRule: bundle.businessRule ?? null,
    brand: bundle.brand,
    intent: bundle.intent,
    theme,
    footerText: footer,
  };
}

export default {
  composeFromUnderstandingBundle,
  bundleToLoyaltyContracts,
  layoutContractToDetectedGrid,
  resolveThemeFromBrandProfile,
};

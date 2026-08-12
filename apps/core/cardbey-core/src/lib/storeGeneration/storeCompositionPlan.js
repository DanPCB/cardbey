/**
 * StoreCompositionPlan + ThemeSpec — composition output before draft materialisation.
 * Phase 1 contract (unwired).
 */

import { getArchetypeDefaults, inferArchetypeFromHints } from './businessArchetypes.js';
import { resolveThemePriorityTier } from './brandStyleProfile.js';

/**
 * @typedef {import('./businessArchetypes.js').BusinessArchetype} BusinessArchetype
 * @typedef {import('./brandStyleProfile.js').BrandStyleProfile} BrandStyleProfile
 * @typedef {import('./businessUnderstanding.js').BusinessUnderstanding} BusinessUnderstanding
 */

/**
 * @typedef {{
 *   primary?: string | null,
 *   secondary?: string | null,
 *   accent?: string | null,
 *   background?: string | null,
 *   text?: string | null,
 *   typographyDirection?: string | null,
 *   spacing?: string | null,
 *   cardTreatment?: string | null,
 *   borderRadius?: string | null,
 *   sectionRhythm?: string | null,
 *   heroPresentation?: string | null,
 *   navigationTreatment?: string | null,
 *   imageRatio?: string | null,
 *   CTATreatment?: string | null,
 *   backgroundTreatment?: string | null,
 *   density?: string | null,
 *   motion?: string | null,
 *   priorityTier?: string | null,
 * }} ThemeSpec
 */

/**
 * @typedef {{
 *   schema: 'cb-store-composition-plan',
 *   version: 'v1',
 *   archetype: BusinessArchetype,
 *   sections: string[],
 *   sectionPriority: string[],
 *   navigation: string[],
 *   heroStrategy: string | null,
 *   offeringPresentation: string | null,
 *   trustPresentation: string | null,
 *   primaryCTA: string | null,
 *   secondaryCTA: string | null,
 *   mediaStrategy: string | null,
 *   themeSpec: ThemeSpec,
 *   resourceRequirements: Array<{
 *     purpose: string,
 *     subjectHints: string[],
 *     toneHints: string[],
 *     negativeHints: string[],
 *     paletteHints: string[],
 *   }>,
 *   forbiddenPatterns: string[],
 *   genericnessRisk: 'low'|'medium'|'high',
 * }} StoreCompositionPlan
 */

/**
 * @param {Partial<ThemeSpec>} [input]
 * @returns {ThemeSpec}
 */
export function createEmptyThemeSpec(input = {}) {
  return {
    primary: input.primary ?? null,
    secondary: input.secondary ?? null,
    accent: input.accent ?? null,
    background: input.background ?? null,
    text: input.text ?? null,
    typographyDirection: input.typographyDirection ?? null,
    spacing: input.spacing ?? null,
    cardTreatment: input.cardTreatment ?? null,
    borderRadius: input.borderRadius ?? null,
    sectionRhythm: input.sectionRhythm ?? null,
    heroPresentation: input.heroPresentation ?? null,
    navigationTreatment: input.navigationTreatment ?? null,
    imageRatio: input.imageRatio ?? null,
    CTATreatment: input.CTATreatment ?? null,
    backgroundTreatment: input.backgroundTreatment ?? null,
    density: input.density ?? null,
    motion: input.motion ?? null,
    priorityTier: input.priorityTier ?? null,
  };
}

/**
 * Build a composition plan from understanding + brand (deterministic, no LLM).
 * @param {{
 *   understanding?: BusinessUnderstanding | null,
 *   brand?: BrandStyleProfile | null,
 *   categoryHint?: string | null,
 *   businessName?: string | null,
 * }} [input]
 * @returns {StoreCompositionPlan}
 */
export function buildStoreCompositionPlan(input = {}) {
  const understanding = input.understanding || null;
  const brand = input.brand || null;
  const archetype =
    understanding?.archetype ||
    inferArchetypeFromHints({
      category: input.categoryHint || understanding?.category?.value,
      businessName: input.businessName || understanding?.identity?.name?.value,
      businessType: understanding?.businessModel?.value,
    });
  const defaults = getArchetypeDefaults(archetype);
  const primaryCTA =
    (understanding?.primaryActions && understanding.primaryActions[0]) || defaults.primaryCTAs[0] || null;
  const secondaryCTA =
    (understanding?.secondaryActions && understanding.secondaryActions[0]) ||
    defaults.secondaryCTAs[0] ||
    null;

  const themeSpec = createEmptyThemeSpec({
    primary: brand?.primaryColors?.[0] ?? null,
    secondary: brand?.secondaryColors?.[0] ?? null,
    accent: brand?.primaryColors?.[1] ?? null,
    typographyDirection: brand?.typographyDirection ?? null,
    density: brand?.density ?? null,
    CTATreatment: brand?.CTACharacter ?? null,
    heroPresentation: brand?.layoutCharacter ?? null,
    priorityTier: brand ? resolveThemePriorityTier(brand) : 'cardbey_generic',
  });

  const paletteHints = [...(brand?.primaryColors || []), ...(brand?.secondaryColors || [])];
  const resourceRequirements = [
    {
      purpose: 'hero',
      subjectHints: defaults.customerIntent.slice(0, 3),
      toneHints: [brand?.tone, brand?.graphicLanguage].filter(Boolean),
      negativeHints: brand?.negativeResourceCharacteristics || [],
      paletteHints,
    },
  ];

  let genericnessRisk = /** @type {'low'|'medium'|'high'} */ ('medium');
  if (archetype !== 'UNKNOWN' && (brand?.sourceConfidence || 0) >= 0.5) genericnessRisk = 'low';
  if (archetype === 'UNKNOWN' && (!brand || brand.sourceConfidence < 0.25)) genericnessRisk = 'high';

  return {
    schema: 'cb-store-composition-plan',
    version: 'v1',
    archetype,
    sections: [...defaults.sectionPriority],
    sectionPriority: [...defaults.sectionPriority],
    navigation: defaults.sectionPriority.filter((s) =>
      ['menu', 'services', 'products', 'about', 'contact', 'gallery', 'portfolio'].includes(s),
    ),
    heroStrategy: brand?.imageryDirection || 'brand_led',
    offeringPresentation:
      archetype.startsWith('FOOD') || archetype === 'CAFE'
        ? 'menu'
        : archetype === 'RETAIL' || archetype === 'ECOMMERCE'
          ? 'product_grid'
          : 'service_list',
    trustPresentation:
      archetype === 'FINANCIAL_SERVICE' || archetype === 'PROFESSIONAL_SERVICE'
        ? 'credentials_and_process'
        : 'social_optional',
    primaryCTA,
    secondaryCTA,
    mediaStrategy: brand?.imageryDirection || 'category_relevant',
    themeSpec,
    resourceRequirements,
    forbiddenPatterns: [...defaults.forbiddenPatterns],
    genericnessRisk,
  };
}

/**
 * Heuristic anti-generic check on a plan (not a rendered store).
 * @param {StoreCompositionPlan} plan
 * @returns {{ ok: boolean, code?: string, reasons: string[] }}
 */
export function evaluateCompositionGenericness(plan) {
  const reasons = [];
  if (plan.archetype === 'UNKNOWN') reasons.push('archetype_unknown');
  if (plan.themeSpec.priorityTier === 'cardbey_generic') reasons.push('theme_generic_fallback');
  if (plan.genericnessRisk === 'high') reasons.push('genericness_risk_high');
  if (
    plan.primaryCTA &&
    /add to cart/i.test(plan.primaryCTA) &&
    plan.archetype !== 'ECOMMERCE' &&
    plan.archetype !== 'RETAIL'
  ) {
    reasons.push('cta_retail_mismatch');
  }
  if (plan.forbiddenPatterns.includes('add_to_cart_default') && /add to cart/i.test(String(plan.primaryCTA))) {
    reasons.push('forbidden_add_to_cart');
  }
  const ok = reasons.length === 0;
  return {
    ok,
    code: ok ? undefined : 'GENERATION_FAIL_GENERIC',
    reasons,
  };
}

export default {
  createEmptyThemeSpec,
  buildStoreCompositionPlan,
  evaluateCompositionGenericness,
};

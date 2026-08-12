/**
 * BrandStyleProfile — visual identity (separate from factual BusinessUnderstanding).
 * Phase 1 contract (unwired). Later maps from BUE BrandProfile + vision signals.
 */

/**
 * @typedef {{
 *   schema: 'cb-brand-style-profile',
 *   version: 'v1',
 *   sourceConfidence: number,
 *   primaryColors: string[],
 *   secondaryColors: string[],
 *   neutrals: string[],
 *   typographyDirection: string | null,
 *   imageryDirection: string | null,
 *   graphicLanguage: string | null,
 *   layoutCharacter: string | null,
 *   density: 'low'|'medium'|'high'|null,
 *   tone: string | null,
 *   formality: 'casual'|'balanced'|'formal'|null,
 *   trustLevel: 'low'|'medium'|'high'|null,
 *   energy: 'calm'|'balanced'|'bold'|null,
 *   CTACharacter: string | null,
 *   preferredResourceCharacteristics: string[],
 *   negativeResourceCharacteristics: string[],
 *   evidenceRefs: string[],
 * }} BrandStyleProfile
 */

/**
 * @param {Partial<BrandStyleProfile>} [input]
 * @returns {BrandStyleProfile}
 */
export function createEmptyBrandStyleProfile(input = {}) {
  return {
    schema: 'cb-brand-style-profile',
    version: 'v1',
    sourceConfidence:
      typeof input.sourceConfidence === 'number' && Number.isFinite(input.sourceConfidence)
        ? Math.max(0, Math.min(1, input.sourceConfidence))
        : 0,
    primaryColors: Array.isArray(input.primaryColors) ? input.primaryColors : [],
    secondaryColors: Array.isArray(input.secondaryColors) ? input.secondaryColors : [],
    neutrals: Array.isArray(input.neutrals) ? input.neutrals : [],
    typographyDirection: input.typographyDirection ?? null,
    imageryDirection: input.imageryDirection ?? null,
    graphicLanguage: input.graphicLanguage ?? null,
    layoutCharacter: input.layoutCharacter ?? null,
    density: input.density ?? null,
    tone: input.tone ?? null,
    formality: input.formality ?? null,
    trustLevel: input.trustLevel ?? null,
    energy: input.energy ?? null,
    CTACharacter: input.CTACharacter ?? null,
    preferredResourceCharacteristics: Array.isArray(input.preferredResourceCharacteristics)
      ? input.preferredResourceCharacteristics
      : [],
    negativeResourceCharacteristics: Array.isArray(input.negativeResourceCharacteristics)
      ? input.negativeResourceCharacteristics
      : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
  };
}

/**
 * Priority: verified business-owned → official → strong inference → category → generic.
 * @typedef {'business_owned'|'official_public'|'strong_inference'|'category_default'|'cardbey_generic'} ThemePriorityTier
 */

export const THEME_PRIORITY_TIERS = Object.freeze([
  'business_owned',
  'official_public',
  'strong_inference',
  'category_default',
  'cardbey_generic',
]);

/**
 * @param {BrandStyleProfile} profile
 * @returns {ThemePriorityTier}
 */
export function resolveThemePriorityTier(profile) {
  if (profile.sourceConfidence >= 0.75 && profile.primaryColors.length > 0) {
    return 'business_owned';
  }
  if (profile.sourceConfidence >= 0.5 && profile.primaryColors.length > 0) {
    return 'strong_inference';
  }
  if (profile.graphicLanguage || profile.tone) return 'category_default';
  return 'cardbey_generic';
}

export default {
  createEmptyBrandStyleProfile,
  THEME_PRIORITY_TIERS,
  resolveThemePriorityTier,
};

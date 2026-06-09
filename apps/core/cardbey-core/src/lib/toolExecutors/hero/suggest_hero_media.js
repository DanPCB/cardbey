// AUDIT: search_hero_media at media/search_hero_media.js — media search; this suggests queries only
// DANH: skill-round4-hero
/**
 * suggest_hero_media — HeroMediaPicker search suggestions (no DB write).
 * Side effect: none — pure suggestion.
 */

/**
 * @param {object} params
 */
export function buildHeroSuggestions(params) {
  const category = String(params?.category ?? 'store').trim().toLowerCase();
  const brandStyle = String(params?.brandStyle ?? 'modern').trim().toLowerCase();
  const storeName = String(params?.storeName ?? 'store').trim();
  const needsImprovement = Boolean(params?.needsImprovement);

  const suggestions = [
    {
      query: `${category} ${brandStyle} hero banner`,
      rationale: `Matches your ${category} category and ${brandStyle} brand style.`,
    },
    {
      query: `${storeName} storefront welcome`,
      rationale: 'Highlights your store name for a personal hero.',
    },
    {
      query: `${category} professional photo background`,
      rationale: 'Clean background suitable for hero overlay text.',
    },
  ];

  const recommendedAction = needsImprovement
    ? category.includes('video') || brandStyle.includes('dynamic')
      ? 'search_video'
      : 'search_photo'
    : 'keep_current';

  return { suggestions, recommendedAction };
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  // @pure-transform: deterministic hero search suggestions; no DB/API side effects by design.
  const payload = buildHeroSuggestions({
    category: input?.category,
    brandStyle: input?.brandStyle,
    storeName: input?.storeName,
    needsImprovement: input?.needsImprovement,
  });

  return {
    status: 'ok',
    output: payload,
  };
}

export default execute;

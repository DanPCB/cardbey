/**
 * Map vertical slug (from verticalTaxonomy resolveVertical) to template key.
 * HARD GUARD: only food.cafe may use 'cafe'; unknown vertical uses services_generic (never cafe).
 * For fashion: if audience is 'kids', return fashion_kids.
 */

/**
 * @param {string} verticalSlug - e.g. food.cafe, beauty.nails, food.seafood, fashion.kids
 * @param {string} [audience] - 'kids' | 'adults' | 'unisex'; when fashion.* and 'kids', use fashion_kids
 * @returns {string} template key for templateItemsData
 */
export function selectTemplateId(verticalSlug, audience) {
  const slug = (verticalSlug || '').toString().toLowerCase().trim();
  if (!slug) return 'services_generic';

  if (slug === 'food' || slug === 'food.cafe') return 'cafe';
  if (slug === 'food.seafood') return 'food_seafood';
  if (slug === 'food.bakery') return 'food_bakery';
  if (slug.startsWith('food.')) return 'food_restaurant_generic';

  if (slug === 'beauty' || slug === 'beauty.nails' || slug === 'beauty.hair_salon' || slug === 'beauty.barber' || slug === 'beauty.spa' || slug === 'beauty.lashes_brows' || slug === 'beauty.waxing') return 'beauty_nails';
  if (slug.startsWith('health.')) return 'beauty_nails';

  if (slug === 'fashion' || slug.startsWith('fashion.')) {
    if (audience === 'kids') return 'fashion_kids';
    if (slug === 'fashion.kids') return 'fashion_kids';
    return 'fashion_boutique';
  }
  if (slug === 'retail.flower') return 'florist';
  if (slug === 'retail' || slug.startsWith('retail.')) return 'retail';

  if (slug === 'entertainment.game_centre') return 'game_centre';
  if (slug.startsWith('entertainment.')) return 'game_centre';

  if (slug.startsWith('services.') || slug.startsWith('home.') || slug.startsWith('auto.') || slug.startsWith('education.') || slug.startsWith('events.')) return 'services_generic';

  return 'services_generic';
}

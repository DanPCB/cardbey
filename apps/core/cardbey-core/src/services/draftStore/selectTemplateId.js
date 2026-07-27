/**
 * Map vertical slug (from verticalTaxonomy resolveVertical) to template key.
 * HARD GUARD: only food.cafe may use 'cafe'; unknown vertical uses services_generic (never cafe).
 * For fashion: if audience is 'kids', return fashion_kids.
 */

import { cuisineSlugToTemplateKey } from './foodCuisineCatalog.js';
import { industrySlugToTemplateKey } from './industryBlueprintRegistry.js';

/**
 * @param {string} verticalSlug - e.g. food.cafe, beauty.nails, food.seafood, fashion.kids
 * @param {string} [audience] - 'kids' | 'adults' | 'unisex'; when fashion.* and 'kids', use fashion_kids
 * @returns {string} template key for templateItemsData
 */
export function selectTemplateId(verticalSlug, audience) {
  const slug = (verticalSlug || '').toString().toLowerCase().trim();
  if (!slug) return 'services_generic';

  const industryTemplate = industrySlugToTemplateKey(slug);

  if (slug === 'food' || slug === 'food.cafe') return industryTemplate || 'cafe';
  if (slug === 'food.seafood') return 'food_seafood';
  if (slug === 'food.bakery') return industryTemplate || 'food_bakery';
  if (slug === 'food.vietnamese') return 'food_vietnamese';
  if (slug === 'food.asian') return 'food_asian';
  if (slug === 'food.fast_food') return 'food_fast_food';
  if (slug === 'food.restaurant') return industryTemplate || 'food_restaurant_generic';
  if (slug.startsWith('food.')) {
    const cuisineTemplate = cuisineSlugToTemplateKey(slug);
    return cuisineTemplate || industryTemplate || 'food_restaurant_generic';
  }

  if (slug.startsWith('beauty.') || slug.startsWith('health.')) {
    return industryTemplate || 'beauty_salon';
  }

  if (slug === 'fashion' || slug.startsWith('fashion.')) {
    if (audience === 'kids') return 'fashion_kids';
    if (slug === 'fashion.kids') return 'fashion_kids';
    return industryTemplate || 'fashion_boutique';
  }

  if (slug.startsWith('retail.')) {
    if (industryTemplate) return industryTemplate;
    if (slug === 'retail.flower') return 'florist';
    return 'retail';
  }
  if (slug === 'retail') return 'retail';

  if (slug === 'entertainment.game_centre') return 'game_centre';
  if (slug.startsWith('entertainment.')) return 'game_centre';

  if (slug.startsWith('services.') || slug.startsWith('home.') || slug.startsWith('auto.') || slug.startsWith('education.') || slug.startsWith('events.')) {
    if (industryTemplate) return industryTemplate;
    if (slug === 'services.tiling' || slug === 'services.flooring') return 'tiling_flooring';
    return 'services_generic';
  }

  return 'services_generic';
}

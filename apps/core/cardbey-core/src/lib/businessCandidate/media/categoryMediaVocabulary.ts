/**
 * Category-specific representative media — never cross-category fallbacks.
 */

export type PilotCategoryKey =
  | 'bakery'
  | 'cafe'
  | 'restaurant'
  | 'nail_salon'
  | 'hair_salon'
  | 'grocery'
  | 'local_retail'
  | 'home_services'
  | 'unknown';

const CATEGORY_KEYWORDS: Record<PilotCategoryKey, string[]> = {
  bakery: ['bakery', 'bread', 'cakes', 'cupcakes', 'pastries', 'dessert', 'bakehouse', 'patisserie'],
  cafe: ['cafe', 'coffee', 'latte', 'espresso', 'brunch', 'breakfast'],
  restaurant: ['restaurant', 'dining', 'bistro', 'eatery', 'food', 'kitchen'],
  nail_salon: ['nail', 'manicure', 'pedicure', 'nail art', 'nail studio', 'beauty salon nails'],
  hair_salon: ['hair', 'hairdresser', 'barber', 'salon chair', 'haircut', 'hair styling'],
  grocery: ['grocery', 'supermarket', 'produce', 'asian grocery', 'market', 'grocer'],
  local_retail: ['retail', 'shop', 'boutique', 'storefront', 'local shop', 'store'],
  home_services: ['plumber', 'electrician', 'tradie', 'home repair', 'handyman', 'home services'],
  unknown: [],
};

/** Unsplash URLs matched to category — no food images for nail/hair salons. */
const CATEGORY_REPRESENTATIVE_HERO: Record<PilotCategoryKey, string> = {
  bakery:
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=1200&auto=format&fit=crop',
  cafe: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=1200&auto=format&fit=crop',
  restaurant:
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=1200&auto=format&fit=crop',
  nail_salon:
    'https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop',
  hair_salon:
    'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
  grocery:
    'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop',
  local_retail:
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop',
  home_services:
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop',
  unknown:
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200&auto=format&fit=crop',
};

const FOOD_CATEGORY_KEYS = new Set<PilotCategoryKey>(['bakery', 'cafe', 'restaurant', 'grocery']);

export function resolvePilotCategoryKey(
  businessType: string | null | undefined,
  businessName?: string | null,
): PilotCategoryKey {
  const text = [businessName, businessType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

  if (!text.trim()) return 'unknown';

  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS) as [PilotCategoryKey, string[]][]) {
    if (key === 'unknown') continue;
    if (keywords.some((kw) => text.includes(kw))) return key;
  }

  if (text.includes('nail')) return 'nail_salon';
  if (text.includes('hair') || text.includes('barber')) return 'hair_salon';
  if (text.includes('shop') || text.includes('retail')) return 'local_retail';

  return 'unknown';
}

export function categoryRepresentativeHeroUrl(categoryKey: PilotCategoryKey): string {
  return CATEGORY_REPRESENTATIVE_HERO[categoryKey] ?? CATEGORY_REPRESENTATIVE_HERO.unknown;
}

export function isFoodCategoryKey(key: PilotCategoryKey): boolean {
  return FOOD_CATEGORY_KEYS.has(key);
}

export function categoryAllowsAsset(
  categoryKey: PilotCategoryKey,
  assetCategoryKey: PilotCategoryKey,
): boolean {
  if (categoryKey === assetCategoryKey) return true;
  if (categoryKey === 'unknown' || assetCategoryKey === 'unknown') return true;
  if (isFoodCategoryKey(categoryKey) && isFoodCategoryKey(assetCategoryKey)) return true;
  return false;
}

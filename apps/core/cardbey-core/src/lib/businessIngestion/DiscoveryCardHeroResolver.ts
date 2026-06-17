/**
 * Hero media resolution for public Discovery Cards.
 * Sync-only for feed list performance; website OG scrape is deferred to future enrichment.
 */

import type { IngestedSeedRecord } from './types.js';

export type DiscoveryHeroSource =
  | 'website'
  | 'open_graph'
  | 'social_profile'
  | 'logo'
  | 'category_template'
  | 'generic';

const CATEGORY_HERO: Record<string, string> = {
  cafe: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=1200&auto=format&fit=crop',
  coffee: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=1200&auto=format&fit=crop',
  restaurant: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=1200&auto=format&fit=crop',
  food: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200&auto=format&fit=crop',
  bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=1200&auto=format&fit=crop',
  bar: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1200&auto=format&fit=crop',
  salon: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
  hair: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop',
  retail: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop',
  shop: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1200&auto=format&fit=crop',
  gym: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop',
  fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200&auto=format&fit=crop',
  wellness: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?q=80&w=1200&auto=format&fit=crop',
  medical: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?q=80&w=1200&auto=format&fit=crop',
  hotel: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1200&auto=format&fit=crop',
  service: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop',
  cleaning: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop',
};

const GENERIC_HERO =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200&auto=format&fit=crop';

function normalizeCategoryKey(category: string | null | undefined): string {
  return String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchCategoryHero(category: string | null | undefined): string {
  const key = normalizeCategoryKey(category);
  if (!key) return GENERIC_HERO;
  if (CATEGORY_HERO[key]) return CATEGORY_HERO[key];
  for (const [cat, url] of Object.entries(CATEGORY_HERO)) {
    if (key.includes(cat)) return url;
  }
  return GENERIC_HERO;
}

export function resolveDiscoveryCardHero(seed: IngestedSeedRecord): {
  heroImageUrl: string;
  heroImageSource: DiscoveryHeroSource;
} {
  // Future: read cached hero from seed metadata or async OG enrichment.
  const category = seed.normalized.category;
  const url = matchCategoryHero(category);
  return {
    heroImageUrl: url,
    heroImageSource: category ? 'category_template' : 'generic',
  };
}

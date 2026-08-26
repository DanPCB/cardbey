/**
 * Cardbey business category taxonomy — alias SSOT for enrichment + seed normalization.
 * Public enrichment API remains categoryMap.ts (mapToCardbeyCategory / resolveCategory).
 */

import { CARDBEY_CATEGORIES, type CardbeyCategory } from '../lib/businessCandidate/enrichment/constants.js';

export type CategoryTaxonomyEntry = {
  id: string;
  label: CardbeyCategory;
  aliases: string[];
  subCategories: Array<{
    id: string;
    label: string;
    aliases: string[];
  }>;
};

const FOOD_ALIASES = [
  'restaurant',
  'cafe',
  'bakery',
  'bar',
  'pub',
  'tavern',
  'inn',
  'hotel',
  'bistro',
  'grill',
  'steakhouse',
  'brewery',
  'lounge',
  'night_club',
  'food',
  'meal_takeaway',
  'meal_delivery',
  'coffee',
  'catering',
  'cuisine',
  'bakehouse',
  'espresso',
  'cheesecake',
  'pastry',
  'eatery',
  'dining',
  'fast_food',
  'vietnamese',
  'banh mi',
  'cellars',
  'bottle shop',
  'bottleshop',
  'licensed',
  'gastropub',
];

const GROCERY_ALIASES = [
  'grocery',
  'supermarket',
  'convenience',
  'food_store',
  'bottle_shop',
  'asian_grocery',
];

const BEAUTY_ALIASES = [
  'hair',
  'beauty',
  'spa',
  'nail',
  'barber',
  'cosmetics',
  'skin_clinic',
  'laser',
  'hairdresser',
  'salon',
];

const FASHION_ALIASES = ['clothing', 'shoe', 'fashion', 'apparel', 'boutique', 'clothes'];

const HOME_ALIASES = [
  'hardware',
  'home_goods',
  'furniture',
  'garden',
  'florist',
  'interior',
  'home services',
  'plumber',
  'electrician',
  'carpenter',
  'trade',
];

const FITNESS_ALIASES = [
  'gym',
  'fitness',
  'yoga',
  'pilates',
  'personal_trainer',
  'physio',
  'chiro',
  'martial',
];

const PET_ALIASES = ['veterinary', 'pet_store', 'grooming', 'dog_training', 'vet', 'pets'];

const PRO_ALIASES = [
  'accounting',
  'legal',
  'financial',
  'consulting',
  'real_estate',
  'insurance',
  'mortgage',
  'professional',
  'mergers',
  'acquisitions',
  'm&a',
  'merger',
  'acquisition',
  'transaction advisory',
  'capital advisory',
  'corporate finance',
  'investment banking',
  'deal advisory',
  'capital raise',
  'capital raising',
  'capital structuring',
  'business valuation',
  'joint venture',
  'business growth advisory',
  'capital group',
  'advisory',
  'accountant',
  'lawyer',
  'solicitor',
  'bookkeeping',
  'wealth management',
  'financial planning',
  'financial adviser',
  'financial advisor',
];

const AUTO_ALIASES = [
  'car_dealer',
  'car_repair',
  'auto_parts',
  'driving_school',
  'car_wash',
  'mechanic',
  'automotive',
];

const EDU_ALIASES = ['school', 'tutoring', 'childcare', 'language_school', 'music_lessons', 'education'];

const COMMUNITY_ALIASES = [
  'place_of_worship',
  'community',
  'event_venue',
  'cultural',
  'market',
  'events',
];

/** @type {CategoryTaxonomyEntry[]} */
export const CATEGORY_TAXONOMY: CategoryTaxonomyEntry[] = [
  {
    id: 'food_drink',
    label: 'Food & Drink',
    aliases: FOOD_ALIASES,
    subCategories: [
      { id: 'cafe', label: 'Cafe', aliases: ['cafe', 'coffee', 'espresso'] },
      { id: 'bakery', label: 'Bakery', aliases: ['bakery', 'bakehouse', 'pastry', 'croissanterie'] },
      {
        id: 'pub',
        label: 'Pub & bar',
        aliases: [
          'pub',
          'tavern',
          'bar',
          'hotel',
          'inn',
          'brewery',
          'lounge',
          'night_club',
          'gastropub',
          'cocktail bar',
          'wine bar',
          'sports bar',
          'club',
          'nightclub',
          'bottle shop',
          'bottleshop',
          'liquor store',
          'bottle-o',
          'licensed',
          'cellars',
          'alehouse',
        ],
      },
      { id: 'restaurant', label: 'Restaurant', aliases: ['restaurant', 'bistro', 'grill', 'cuisine', 'dining'] },
    ],
  },
  {
    id: 'grocery_essentials',
    label: 'Grocery & Essentials',
    aliases: GROCERY_ALIASES,
    subCategories: [{ id: 'grocery', label: 'Grocery', aliases: GROCERY_ALIASES }],
  },
  {
    id: 'beauty_wellness',
    label: 'Beauty & Wellness',
    aliases: BEAUTY_ALIASES,
    subCategories: [
      { id: 'hair', label: 'Hair salon', aliases: ['hair', 'hairdresser', 'barber', 'salon'] },
      { id: 'nail_salon', label: 'Nail salon', aliases: ['nail', 'nails'] },
      { id: 'spa', label: 'Spa & wellness', aliases: ['spa', 'massage', 'wellness', 'skin_clinic', 'laser'] },
    ],
  },
  {
    id: 'fashion',
    label: 'Fashion',
    aliases: FASHION_ALIASES,
    subCategories: [{ id: 'fashion', label: 'Fashion retail', aliases: FASHION_ALIASES }],
  },
  {
    id: 'home_garden',
    label: 'Home & Garden',
    aliases: HOME_ALIASES,
    subCategories: [
      { id: 'home', label: 'Home & garden', aliases: ['hardware', 'home_goods', 'furniture', 'garden', 'florist'] },
      {
        id: 'home_services',
        label: 'Home services',
        aliases: ['home services', 'plumber', 'electrician', 'carpenter', 'trade'],
      },
    ],
  },
  {
    id: 'health_fitness',
    label: 'Health & Fitness',
    aliases: FITNESS_ALIASES,
    subCategories: [{ id: 'fitness', label: 'Fitness', aliases: FITNESS_ALIASES }],
  },
  {
    id: 'pet_services',
    label: 'Pet Services',
    aliases: PET_ALIASES,
    subCategories: [{ id: 'pets', label: 'Pet services', aliases: PET_ALIASES }],
  },
  {
    id: 'professional',
    label: 'Professional',
    aliases: PRO_ALIASES,
    subCategories: [
      {
        id: 'ma-advisory',
        label: 'M&A Advisory',
        aliases: [
          'mergers',
          'acquisitions',
          'm&a',
          'merger',
          'acquisition',
          'transaction advisory',
          'capital advisory',
          'corporate finance',
          'investment banking',
          'deal advisory',
          'capital raise',
          'capital raising',
          'capital structuring',
          'business valuation',
          'joint venture',
          'business growth advisory',
          'capital group',
        ],
      },
      {
        id: 'accounting',
        label: 'Accounting',
        aliases: ['accounting', 'accountant', 'bookkeeping', 'tax', 'cpa', 'bas'],
      },
      {
        id: 'legal',
        label: 'Legal',
        aliases: ['legal', 'lawyer', 'solicitor', 'law firm', 'barrister', 'conveyancing'],
      },
      {
        id: 'real-estate',
        label: 'Real estate',
        aliases: ['real estate', 'property', 'agency', 'agent', 'property management'],
      },
      {
        id: 'consulting',
        label: 'Consulting',
        aliases: ['consulting', 'consultant', 'strategy', 'management consulting'],
      },
      {
        id: 'mortgage-broker',
        label: 'Mortgage & Finance Broker',
        aliases: [
          'mortgage broker',
          'finance broker',
          'financial broker',
          'home loan',
          'home loans',
          'mortgage',
          'refinance',
          'refinancing',
          'loan broker',
          'credit broker',
          'lending',
          'low doc',
          'low-doc',
          'smsf loan',
          'property finance',
          'debt consolidation',
          'loan consolidation',
          '100+ banks',
          '100+ lenders',
          'awe financial',
          'ngân hàng',
          'vay',
          'lãi suất',
          'tài chính',
        ],
      },
      {
        id: 'financial-planning',
        label: 'Financial planning',
        aliases: [
          'financial planning',
          'financial planner',
          'financial adviser',
          'financial advisor',
          'wealth management',
          'superannuation',
          'smsf',
          'retirement planning',
          'investment advice',
          'financial future',
          'empowering your financial',
        ],
      },
      {
        id: 'insurance',
        label: 'Insurance',
        // Do not use bare "broker" — that steals mortgage/finance brokers.
        aliases: ['insurance', 'insurance broker', 'underwriter', 'general insurance', 'life insurance'],
      },
      {
        id: 'professional',
        label: 'Professional services',
        aliases: PRO_ALIASES,
      },
    ],
  },
  {
    id: 'auto_transport',
    label: 'Auto & Transport',
    aliases: AUTO_ALIASES,
    subCategories: [{ id: 'auto', label: 'Auto & transport', aliases: AUTO_ALIASES }],
  },
  {
    id: 'education',
    label: 'Education',
    aliases: EDU_ALIASES,
    subCategories: [{ id: 'education', label: 'Education', aliases: EDU_ALIASES }],
  },
  {
    id: 'community_events',
    label: 'Community & Events',
    aliases: COMMUNITY_ALIASES,
    subCategories: [{ id: 'community', label: 'Community & events', aliases: COMMUNITY_ALIASES }],
  },
  {
    id: 'other',
    label: 'Other',
    aliases: ['other', 'general', 'unknown'],
    subCategories: [],
  },
];

const LABEL_TO_ENTRY = new Map(CATEGORY_TAXONOMY.map((entry) => [entry.label.toLowerCase(), entry]));

export function listCardbeyCategoryLabels(): readonly CardbeyCategory[] {
  return CARDBEY_CATEGORIES;
}

function haystack(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => {
    const normalized = n.replace(/_/g, ' ').toLowerCase();
    return text.includes(normalized) || text.includes(n.toLowerCase());
  });
}

export function resolveCategoryFromSignals(input: {
  businessName?: string | null;
  businessType?: string | null;
  placesTypes?: string[] | null;
  osmTag?: string | null;
  igCategory?: string | null;
  fbCategory?: string | null;
  ypCategory?: string | null;
  ypSnippet?: string | null;
  trueLocalSnippet?: string | null;
  websiteNavItems?: string[] | null;
}): CardbeyCategory {
  const text = haystack([
    input.businessName,
    input.businessType,
    ...(input.placesTypes ?? []),
    input.osmTag,
    input.igCategory,
    input.fbCategory,
    input.ypCategory,
    input.ypSnippet,
    input.trueLocalSnippet,
    ...(input.websiteNavItems ?? []),
  ]);

  for (const entry of CATEGORY_TAXONOMY) {
    if (entry.label === 'Other') continue;
    if (includesAny(text, entry.aliases)) {
      return entry.label;
    }
  }

  return 'Other';
}

export function resolveSubCategory(input: {
  category: CardbeyCategory;
  businessName?: string | null;
  businessType?: string | null;
  placesTypes?: string[] | null;
  tags?: string[] | null;
}): string | null {
  const entry =
    LABEL_TO_ENTRY.get(input.category.toLowerCase()) ??
    CATEGORY_TAXONOMY.find((row) => row.label === input.category);
  if (!entry?.subCategories.length) return null;

  const text = haystack([
    input.businessName,
    input.businessType,
    ...(input.placesTypes ?? []),
    ...(input.tags ?? []),
  ]);

  for (const sub of entry.subCategories) {
    if (includesAny(text, sub.aliases)) {
      return sub.label;
    }
  }
  return null;
}

export function taxonomyTagsForCategory(input: {
  category: CardbeyCategory;
  businessName?: string | null;
  businessType?: string | null;
  placesTypes?: string[] | null;
}): string[] {
  const tags: string[] = [];
  const sub = resolveSubCategory(input);
  if (sub) {
    tags.push(sub.toLowerCase().replace(/\s+/g, '-').slice(0, 40));
  }
  const entry = CATEGORY_TAXONOMY.find((row) => row.label === input.category);
  if (entry && entry.id !== 'other' && !tags.length) {
    tags.push(entry.id.replace(/_/g, '-'));
  }
  return tags.slice(0, 5);
}

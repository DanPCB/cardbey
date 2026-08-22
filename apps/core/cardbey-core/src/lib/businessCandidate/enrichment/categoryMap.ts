/**
 * Map discovery / OSM / social / aggregator signals → Cardbey category + tags.
 */

import type { CardbeyCategory } from './constants.js';

const FOOD_TYPES = [
  'restaurant',
  'cafe',
  'bakery',
  'bar',
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
];

const GROCERY_TYPES = [
  'grocery',
  'supermarket',
  'convenience',
  'food_store',
  'bottle_shop',
  'asian_grocery',
];

const BEAUTY_TYPES = [
  'hair',
  'beauty',
  'spa',
  'nail',
  'barber',
  'cosmetics',
  'skin_clinic',
  'laser',
];

const FASHION_TYPES = ['clothing', 'shoe', 'fashion', 'apparel', 'boutique'];

const HOME_TYPES = [
  'hardware',
  'home_goods',
  'furniture',
  'garden',
  'florist',
  'interior',
];

const FITNESS_TYPES = [
  'gym',
  'fitness',
  'yoga',
  'pilates',
  'personal_trainer',
  'physio',
  'chiro',
  'martial',
];

const PET_TYPES = ['veterinary', 'pet_store', 'grooming', 'dog_training', 'vet'];

const PRO_TYPES = [
  'accounting',
  'legal',
  'financial',
  'consulting',
  'real_estate',
  'insurance',
  'mortgage',
];

const AUTO_TYPES = [
  'car_dealer',
  'car_repair',
  'auto_parts',
  'driving_school',
  'car_wash',
  'mechanic',
];

const EDU_TYPES = ['school', 'tutoring', 'childcare', 'language_school', 'music_lessons'];

const COMMUNITY_TYPES = [
  'place_of_worship',
  'community',
  'event_venue',
  'cultural',
  'market',
];

function haystack(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n.replace(/_/g, ' ')) || text.includes(n));
}

export function mapToCardbeyCategory(input: {
  businessName?: string | null;
  businessType?: string | null;
  placesTypes?: string[] | null;
  osmTag?: string | null;
  igCategory?: string | null;
  fbCategory?: string | null;
  ypCategory?: string | null;
  websiteNavItems?: string[] | null;
}): { category: CardbeyCategory; tags: string[]; confidence: number } {
  const text = haystack([
    input.businessName,
    input.businessType,
    ...(input.placesTypes ?? []),
    input.osmTag,
    input.igCategory,
    input.fbCategory,
    input.ypCategory,
    ...(input.websiteNavItems ?? []),
  ]);

  const tags: string[] = [];
  const pushTag = (t: string) => {
    const clean = t.toLowerCase().replace(/\s+/g, '-').slice(0, 40);
    if (clean && !tags.includes(clean) && tags.length < 5) tags.push(clean);
  };

  if (includesAny(text, FOOD_TYPES)) {
    if (text.includes('cafe') || text.includes('coffee') || text.includes('espresso')) pushTag('cafe');
    if (text.includes('bakery') || text.includes('bakehouse') || text.includes('pastry')) pushTag('bakery');
    if (text.includes('restaurant') || text.includes('vietnamese') || text.includes('cuisine')) {
      pushTag('restaurant');
    }
    return { category: 'Food & Drink', tags, confidence: 0.85 };
  }
  if (includesAny(text, GROCERY_TYPES)) {
    pushTag('grocery');
    return { category: 'Grocery & Essentials', tags, confidence: 0.85 };
  }
  if (includesAny(text, BEAUTY_TYPES)) {
    if (text.includes('nail')) pushTag('nail-salon');
    if (text.includes('hair') || text.includes('barber')) pushTag('hair');
    return { category: 'Beauty & Wellness', tags, confidence: 0.85 };
  }
  if (includesAny(text, FASHION_TYPES)) {
    pushTag('fashion');
    return { category: 'Fashion', tags, confidence: 0.8 };
  }
  if (includesAny(text, HOME_TYPES)) {
    pushTag('home');
    return { category: 'Home & Garden', tags, confidence: 0.8 };
  }
  if (includesAny(text, FITNESS_TYPES)) {
    pushTag('fitness');
    return { category: 'Health & Fitness', tags, confidence: 0.85 };
  }
  if (includesAny(text, PET_TYPES)) {
    pushTag('pets');
    return { category: 'Pet Services', tags, confidence: 0.85 };
  }
  if (includesAny(text, PRO_TYPES)) {
    pushTag('professional');
    return { category: 'Professional', tags, confidence: 0.75 };
  }
  if (includesAny(text, AUTO_TYPES)) {
    pushTag('auto');
    return { category: 'Auto & Transport', tags, confidence: 0.8 };
  }
  if (includesAny(text, EDU_TYPES)) {
    pushTag('education');
    return { category: 'Education', tags, confidence: 0.8 };
  }
  if (includesAny(text, COMMUNITY_TYPES)) {
    pushTag('community');
    return { category: 'Community & Events', tags, confidence: 0.75 };
  }

  return { category: 'Other', tags, confidence: 0.5 };
}

export function isDefaultOtherCategory(category: string | null | undefined): boolean {
  return !category || category.trim().toLowerCase() === 'other';
}

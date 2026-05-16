/**
 * Universal SME seed builder: generate ~30 items from classification profile.
 * Always available; must not use cafe defaults unless profile says food/cafe.
 * Uses cached seed when available, else businessModel-based item lists.
 */

import { getOrFetchSeedCatalog } from './seedCatalogService.js';

const TARGET_COUNT = 30;

/** Services: core services + packages + quote. No coffee/cafe. */
const SERVICES_ITEMS = [
  'Core Service', 'Standard Package', 'Premium Package', 'Basic Service', 'Extended Service',
  'Consultation', 'Assessment', 'Quote', 'Custom Quote', 'Call-out Fee', 'Site Visit',
  'Starter Package', 'Essential Package', 'Complete Package', 'Add-on Service',
  'Follow-up Visit', 'Maintenance Service', 'One-off Service', 'Recurring Service',
  'Express Service', 'Standard Visit', 'Full Service', 'Basic Package', 'Value Package',
  'Priority Service', 'Emergency Call-out', 'Scheduled Visit', 'Inspection', 'Report',
  'Support Package',
];

/** Retail: categories + SKU-style names. No cafe. */
const RETAIL_ITEMS = [
  'Product One', 'Product Two', 'Best Seller', 'Popular Item', 'New Arrival',
  'Seasonal Item', 'Essential Range', 'Premium Line', 'Standard Option', 'Value Pick',
  'Gift Option', 'Bundle Deal', 'Starter Kit', 'Single Unit', 'Multi-pack',
  'Size S', 'Size M', 'Size L', 'Variant A', 'Variant B', 'Colour Option',
  'Accessory', 'Add-on', 'Replacement', 'Spare Part', 'Consumable',
  'Display Item', 'Clearance Item', 'Sale Item', 'Limited Edition',
];

/** Food (generic menu): menu structure items. No coffee/espresso unless cafe. */
const FOOD_GENERIC_ITEMS = [
  'House Special', 'Chef\'s Recommendation', 'Daily Special', 'Seasonal Dish',
  'Starter', 'Main Course', 'Dessert', 'Side Dish', 'Salad', 'Soup',
  'Kids Meal', 'Vegetarian Option', 'Share Plate', 'Light Bite',
  'Beverage', 'Soft Drink', 'Juice', 'Water', 'Dessert Special',
  'Add-on', 'Extra Side', 'Sauce', 'Combo Meal', 'Value Meal',
  'Breakfast Item', 'Lunch Special', 'Dinner Main', 'Snack', 'Treat',
  'Seasonal Special',
];

/** Food cafe-only: add coffee items. Use only when verticalSlug is food.cafe. */
const FOOD_CAFE_ITEMS = [
  'Espresso', 'Cappuccino', 'Latte', 'Flat White', 'Americano', 'Mocha',
  'Cold Brew', 'Iced Coffee', 'Tea', 'Chai', 'Hot Chocolate', 'Croissant',
  'Muffin', 'Toast', 'Sandwich', 'Pastry',
];

/**
 * Build seed items from profile. Uses cached seed when available; else businessModel lists.
 * Never returns cafe/coffee items unless profile.verticalSlug is food.cafe (or food with cafe intent).
 * @param {{ verticalSlug: string, businessModel: string, audience: string }} profile - from classifyBusinessProfile
 * @param {number} [targetCount]
 * @returns {Promise<{ items: { name: string, description?: string }[] }>}
 */
export async function buildSeedCatalog(profile, targetCount = TARGET_COUNT) {
  const slug = (profile?.verticalSlug || '').toString().trim() || 'services.generic';
  const businessModel = (profile?.businessModel || 'services').toLowerCase();
  const audience = (profile?.audience || 'adults').toLowerCase();
  const isCafe = slug === 'food.cafe';
  const count = Math.min(36, Math.max(24, targetCount));

  const cached = await getOrFetchSeedCatalog(slug, audience === 'kids' ? audience : '');
  if (cached && cached.items && cached.items.length >= 15) {
    const items = (cached.items).slice(0, count).map((it) => ({
      name: (it.name || '').trim() || 'Item',
      description: it.description != null ? String(it.description).trim() : null,
    })).filter((it) => it.name.length >= 2);
    if (items.length >= 15) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[smeSeedBuilder] using cached seed', { verticalSlug: slug, itemCount: items.length });
      }
      return { items };
    }
  }

  let names = [];
  if (businessModel === 'food') {
    names = [...FOOD_GENERIC_ITEMS];
    if (isCafe) names.push(...FOOD_CAFE_ITEMS);
  } else if (businessModel === 'retail') {
    names = [...RETAIL_ITEMS];
    if (audience === 'kids') {
      names = names.filter((n) => !/\b(adult|men's|women's|formal)\b/i.test(n));
      if (names.length < 20) names = ['Kids Item', 'Children\'s Product', 'Toddler Size', 'Baby Range', ...RETAIL_ITEMS].slice(0, count);
    }
  } else {
    names = [...SERVICES_ITEMS];
  }

  const items = names.slice(0, count).map((name) => ({ name, description: null }));
  if (process.env.NODE_ENV !== 'production') {
    console.log('[smeSeedBuilder] generated from businessModel', { businessModel, verticalSlug: slug, itemCount: items.length, isCafe });
  }
  return { items };
}

/**
 * Universal Seed Catalog Builder: categories + items + imageQueryHints from profile.
 * Food: 5 categories × 6 items = 30; Retail: 6 × 5 = 30; Services/unknown: 30 items (tiers/packages/quotes).
 * No cafe items unless verticalSlug = food.cafe. Min 24 items; expand with same-vertical variations.
 */

const MIN_ITEMS = 24;
const TARGET_DEFAULT = 30;

/** Coffee/cafe keywords – must not appear in non-food or food.seafood. */
const COFFEE_KEYWORDS = ['espresso', 'latte', 'cappuccino', 'coffee', 'mocha', 'flat white', 'cold brew', 'croissant', 'muffin'];

/** Food: 5 categories × 6 items. Bakery and cafe get vertical-appropriate items; no cafe items unless food.cafe. */
function buildFoodSeed(profile, targetCount) {
  const slug = (profile?.verticalSlug || '').toLowerCase();
  const isCafe = slug === 'food.cafe';
  const isBakery = slug === 'food.bakery';
  const categories = [
    { id: 'cat_food_0', name: isBakery ? 'Pastries' : 'Starters' },
    { id: 'cat_food_1', name: isBakery ? 'Bread & Loaves' : 'Mains' },
    { id: 'cat_food_2', name: isBakery ? 'Sweets' : 'Sides' },
    { id: 'cat_food_3', name: 'Drinks' },
    { id: 'cat_food_4', name: 'Desserts' },
  ];
  let starters = ['House Salad', 'Soup of the Day', 'Garlic Bread', 'Bruschetta', 'Spring Rolls', 'Dips & Bread'];
  let mains = ['Chef\'s Special', 'Grilled Option', 'Pasta of the Day', 'Vegetarian Main', 'Fish of the Day', 'Seasonal Dish'];
  let sides = ['Chips', 'Garden Salad', 'Steamed Vegetables', 'Rice', 'Coleslaw', 'Side Salad'];
  if (isBakery) {
    starters = ['Croissant', 'Danish', 'Muffin', 'Scone', 'Palmier', 'Biscotti'];
    mains = ['Sourdough Bread', 'Baguette', 'Focaccia', 'Loaf Cake', 'Bread Roll', 'Pie Slice'];
    sides = ['Cookie', 'Brownie', 'Macaron', 'Cupcake', 'Tart', 'Éclair'];
  }
  let drinks = ['Soft Drink', 'Juice', 'Water', 'Iced Tea', 'Lemonade', 'Sparkling Water'];
  if (isCafe) drinks = ['Espresso', 'Cappuccino', 'Latte', 'Flat White', 'Cold Brew', 'Tea'];
  if (isBakery) drinks = ['Coffee', 'Tea', 'Hot Chocolate', 'Juice', 'Water', 'Iced Coffee'];
  const desserts = isBakery
    ? ['Cake Slice', 'Cheesecake', 'Strudel', 'Bread Pudding', 'Pavlova', 'Donut']
    : ['Dessert of the Day', 'Ice Cream', 'Fruit Plate', 'Cake Slice', 'Cheesecake', 'Brownie'];
  const all = [
    ...starters.map((n, i) => ({ categoryId: categories[0].id, name: n })),
    ...mains.map((n, i) => ({ categoryId: categories[1].id, name: n })),
    ...sides.map((n, i) => ({ categoryId: categories[2].id, name: n })),
    ...drinks.map((n, i) => ({ categoryId: categories[3].id, name: n })),
    ...desserts.map((n, i) => ({ categoryId: categories[4].id, name: n })),
  ];
  const items = all.slice(0, targetCount).map((it, i) => ({
    id: `item_seed_${i}`,
    name: it.name,
    description: null,
    price: null,
    categoryId: it.categoryId,
  }));
  const imageQueryHints = categories.reduce((acc, c) => {
    acc[c.id] = [c.name.toLowerCase(), 'restaurant dish'];
    return acc;
  }, {});
  return { categories, items, imageQueryHints, meta: { catalogSource: 'seed', vertical: profile?.verticalSlug } };
}

/** Retail: 6 categories × 5 items = 30, variant scaffolds. */
function buildRetailSeed(profile, targetCount) {
  const categories = [
    { id: 'cat_retail_0', name: 'Featured' },
    { id: 'cat_retail_1', name: 'Best Sellers' },
    { id: 'cat_retail_2', name: 'New Arrivals' },
    { id: 'cat_retail_3', name: 'Essentials' },
    { id: 'cat_retail_4', name: 'Variants' },
    { id: 'cat_retail_5', name: 'Add-ons' },
  ];
  const names = [
    'Featured Item', 'Popular Pick', 'Customer Favourite', 'Top Seller', 'Staff Pick',
    'Best Seller One', 'Best Seller Two', 'Best Seller Three', 'Best Seller Four', 'Best Seller Five',
    'New Arrival', 'Just In', 'Seasonal New', 'Limited Edition', 'New Style',
    'Essential Item', 'Core Product', 'Staple Item', 'Basic Option', 'Standard Range',
    'Variant A', 'Variant B', 'Size S', 'Size M', 'Size L',
    'Add-on', 'Accessory', 'Replacement', 'Spare', 'Bundle',
  ];
  const items = names.slice(0, Math.min(targetCount, names.length)).map((name, i) => ({
    id: `item_seed_${i}`,
    name,
    description: null,
    price: null,
    categoryId: categories[Math.floor(i / 5) % categories.length].id,
  }));
  if (items.length < MIN_ITEMS) {
    for (let i = items.length; i < MIN_ITEMS; i++) {
      items.push({
        id: `item_seed_${i}`,
        name: `Item ${i + 1}`,
        description: null,
        price: null,
        categoryId: categories[0].id,
      });
    }
  }
  const imageQueryHints = categories.reduce((acc, c) => {
    acc[c.id] = [c.name.toLowerCase(), 'product'];
    return acc;
  }, {});
  return { categories, items, imageQueryHints, meta: { catalogSource: 'seed', vertical: profile?.verticalSlug } };
}

/** Services / unknown: 30 items – tiers, packages, quotes. No coffee. */
function buildServicesSeed(profile, targetCount) {
  const categories = [
    { id: 'cat_svc_0', name: 'Core Services' },
    { id: 'cat_svc_1', name: 'Packages' },
    { id: 'cat_svc_2', name: 'Quotes & Call-out' },
  ];
  const core = ['Core Service', 'Standard Service', 'Premium Service', 'Basic Service', 'Extended Service', 'Consultation', 'Assessment', 'Site Visit', 'Follow-up', 'Maintenance'];
  const packages = ['Starter Package', 'Essential Package', 'Complete Package', 'Value Package', 'Business Package', 'Add-on Service', 'One-off Service', 'Recurring Service', 'Express Service', 'Full Service'];
  const quotes = ['Quote', 'Custom Quote', 'Call-out Fee', 'Inspection', 'Report', 'Scheduled Visit', 'Emergency Call-out', 'Priority Service', 'Support Package', 'Standard Visit'];
  const all = [...core, ...packages, ...quotes];
  const items = all.slice(0, targetCount).map((name, i) => ({
    id: `item_seed_${i}`,
    name,
    description: null,
    price: null,
    categoryId: categories[Math.floor(i / 10) % 3].id,
  }));
  if (items.length < MIN_ITEMS) {
    for (let i = items.length; i < MIN_ITEMS; i++) {
      items.push({ id: `item_seed_${i}`, name: `Service ${i + 1}`, description: null, price: null, categoryId: categories[0].id });
    }
  }
  const imageQueryHints = categories.reduce((acc, c) => {
    acc[c.id] = [c.name.toLowerCase(), 'service'];
    return acc;
  }, {});
  return { categories, items, imageQueryHints, meta: { catalogSource: 'seed', vertical: profile?.verticalSlug } };
}

/**
 * Build seed catalog from profile. Works for unknown business types.
 * @param {{ verticalGroup?: string, verticalSlug?: string, businessModel?: string, audience?: string }} profile
 * @param {{ targetCount?: number }} opts
 * @returns {{ categories: { id: string, name: string }[], items: { id: string, name: string, description?: string, price?: string, categoryId: string }[], imageQueryHints: object, meta: object }}
 */
export function buildSeedCatalog(profile, opts = {}) {
  const targetCount = Math.max(MIN_ITEMS, Math.min(36, opts?.targetCount ?? TARGET_DEFAULT));
  const group = (profile?.verticalGroup || '').toLowerCase();
  const model = (profile?.businessModel || '').toLowerCase();
  const slug = (profile?.verticalSlug || '').toLowerCase();

  if (group === 'food' || model === 'food') {
    return buildFoodSeed(profile, targetCount);
  }
  if (group === 'retail' || model === 'retail' || group === 'fashion' || group === 'beauty') {
    return buildRetailSeed(profile, targetCount);
  }
  return buildServicesSeed(profile, targetCount);
}

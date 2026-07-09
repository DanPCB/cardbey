/**
 * Cuisine-aware food menu banks — deterministic fallback when AI is unavailable
 * and repair source when service placeholders leak into food catalogs.
 * Goal: menus as specific as the business type (e.g. Vietnamese restaurant → Phở, Gỏi cuốn).
 */

import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';
import { CATALOG_ITEM_LIMIT, CATALOG_ITEM_MIN } from '../../config/catalogLimits.js';

/** @typedef {{ id: string, name: string }} MenuCategory */
/** @typedef {{ id: string, name: string, description?: string | null, price?: string | null, categoryId: string }} MenuItem */

const CUISINE_BANKS = {
  'food.vietnamese': {
    label: 'Vietnamese',
    categories: [
      { key: 'starters', label: 'Starters' },
      { key: 'rolls', label: 'Rolls & Salads' },
      { key: 'noodles', label: 'Noodles & Phở' },
      { key: 'rice', label: 'Rice & Combos' },
      { key: 'drinks', label: 'Drinks' },
    ],
    items: [
      { categoryKey: 'starters', name: 'Chả giò', description: 'Crispy pork spring rolls with nuoc cham.', price: '$10.00' },
      { categoryKey: 'starters', name: 'Gỏi cuốn', description: 'Fresh rice paper rolls with prawn and herbs.', price: '$12.00' },
      { categoryKey: 'starters', name: 'Bánh xèo', description: 'Sizzling turmeric crepe with pork and prawns.', price: '$14.00' },
      { categoryKey: 'starters', name: 'Đậu hũ chiên', description: 'Crispy fried tofu with dipping sauce.', price: '$11.00' },
      { categoryKey: 'rolls', name: 'Gỏi đu đủ', description: 'Green papaya salad with peanuts and lime.', price: '$13.00' },
      { categoryKey: 'rolls', name: 'Bò tái chanh', description: 'Beef salad with lime and fresh herbs.', price: '$15.00' },
      { categoryKey: 'noodles', name: 'Phở Bò', description: 'Classic beef noodle soup with herbs.', price: '$16.00' },
      { categoryKey: 'noodles', name: 'Phở Gà', description: 'Chicken pho with rice noodles.', price: '$15.00' },
      { categoryKey: 'noodles', name: 'Bún bò Huế', description: 'Spicy lemongrass beef noodle soup.', price: '$17.00' },
      { categoryKey: 'noodles', name: 'Mì Quảng', description: 'Turmeric noodles with pork and peanuts.', price: '$16.00' },
      { categoryKey: 'rice', name: 'Cơm tấm', description: 'Broken rice with grilled pork chop.', price: '$15.00' },
      { categoryKey: 'rice', name: 'Cơm gà', description: 'Chicken rice with fish sauce dressing.', price: '$14.00' },
      { categoryKey: 'rice', name: 'Bánh mì thịt', description: 'Vietnamese baguette with grilled pork.', price: '$10.00' },
      { categoryKey: 'drinks', name: 'Cà phê sữa đá', description: 'Iced Vietnamese coffee with condensed milk.', price: '$6.00' },
      { categoryKey: 'drinks', name: 'Trà đá', description: 'Iced jasmine tea.', price: '$4.00' },
      { categoryKey: 'drinks', name: 'Sinh tố bơ', description: 'Avocado smoothie.', price: '$7.00' },
    ],
    promptHints:
      'Generate an authentic Vietnamese restaurant menu. Use real Vietnamese dish names (with accents where natural, e.g. Phở Bò, Gỏi cuốn, Chả giò, Bánh mì, Bún bò Huế). Categories: Starters, Rolls & Salads, Noodles & Phở, Rice & Combos, Drinks. Prices in local currency. No Western generic items (no "Business Package", "House Special", "Garlic Bread" unless clearly fusion).',
  },
  'food.asian': {
    label: 'Asian',
    categories: [
      { key: 'starters', label: 'Starters' },
      { key: 'mains', label: 'Mains' },
      { key: 'noodles', label: 'Noodles & Rice' },
      { key: 'sides', label: 'Sides' },
      { key: 'drinks', label: 'Drinks' },
    ],
    items: [
      { categoryKey: 'starters', name: 'Edamame', description: 'Steamed soybeans with sea salt.', price: '$8.00' },
      { categoryKey: 'starters', name: 'Gyoza', description: 'Pan-fried pork dumplings.', price: '$12.00' },
      { categoryKey: 'starters', name: 'Spring Rolls', description: 'Crispy vegetable spring rolls.', price: '$10.00' },
      { categoryKey: 'mains', name: 'Pad Thai', description: 'Stir-fried rice noodles with tamarind.', price: '$16.00' },
      { categoryKey: 'mains', name: 'Green Curry', description: 'Thai green curry with jasmine rice.', price: '$17.00' },
      { categoryKey: 'mains', name: 'Teriyaki Chicken', description: 'Grilled chicken with teriyaki glaze.', price: '$18.00' },
      { categoryKey: 'noodles', name: 'Ramen', description: 'Pork broth ramen with chashu.', price: '$17.00' },
      { categoryKey: 'noodles', name: 'Fried Rice', description: 'Wok-fried rice with egg and vegetables.', price: '$14.00' },
      { categoryKey: 'sides', name: 'Steamed Rice', description: 'Jasmine rice.', price: '$4.00' },
      { categoryKey: 'drinks', name: 'Thai Iced Tea', description: 'Sweet spiced tea with milk.', price: '$6.00' },
    ],
    promptHints:
      'Generate an Asian restaurant menu appropriate to the business name and type (Thai, Japanese, Chinese, Korean, etc.). Use authentic dish names for the inferred cuisine. Avoid generic Western restaurant items.',
  },
  'food.fast_food': {
    label: 'Fast Food',
    categories: [
      { key: 'burgers', label: 'Burgers' },
      { key: 'wraps', label: 'Wraps & Snacks' },
      { key: 'sides', label: 'Sides' },
      { key: 'drinks', label: 'Drinks' },
    ],
    items: [
      { categoryKey: 'burgers', name: 'Classic Burger', description: 'Beef patty, lettuce, tomato, sauce.', price: '$12.00' },
      { categoryKey: 'burgers', name: 'Cheeseburger', description: 'Classic burger with cheddar.', price: '$13.00' },
      { categoryKey: 'burgers', name: 'Chicken Burger', description: 'Crispy chicken fillet burger.', price: '$12.50' },
      { categoryKey: 'wraps', name: 'Chicken Wrap', description: 'Grilled chicken wrap with salad.', price: '$11.00' },
      { categoryKey: 'wraps', name: 'Kebab Box', description: 'Mixed kebab with salad and sauce.', price: '$14.00' },
      { categoryKey: 'sides', name: 'Fries', description: 'Crispy golden fries.', price: '$5.00' },
      { categoryKey: 'sides', name: 'Onion Rings', description: 'Beer-battered onion rings.', price: '$6.00' },
      { categoryKey: 'drinks', name: 'Soft Drink', description: 'Choice of flavours.', price: '$4.00' },
    ],
    promptHints:
      'Generate a fast food / takeaway menu: burgers, wraps, fried chicken, sides, combo meals. Quick-service pricing. No fine-dining or service-package language.',
  },
  'food.cafe': {
    label: 'Cafe',
    categories: [
      { key: 'coffee', label: 'Coffee' },
      { key: 'tea', label: 'Tea & Other Drinks' },
      { key: 'breakfast', label: 'Breakfast' },
      { key: 'bakery', label: 'Bakery' },
      { key: 'lunch', label: 'Light Meals' },
    ],
    items: [
      { categoryKey: 'coffee', name: 'Espresso', description: 'Single shot.', price: '$3.50' },
      { categoryKey: 'coffee', name: 'Flat White', description: 'Velvety microfoam.', price: '$4.50' },
      { categoryKey: 'coffee', name: 'Latte', description: 'Espresso with steamed milk.', price: '$4.50' },
      { categoryKey: 'tea', name: 'Chai Latte', description: 'Spiced tea latte.', price: '$4.50' },
      { categoryKey: 'breakfast', name: 'Avocado Toast', description: 'Sourdough, avocado, feta.', price: '$14.00' },
      { categoryKey: 'bakery', name: 'Croissant', description: 'Buttery pastry.', price: '$4.50' },
      { categoryKey: 'lunch', name: 'Soup of the Day', description: 'Chef\'s daily soup.', price: '$9.00' },
    ],
    promptHints:
      'Generate a cafe menu: espresso drinks, tea, breakfast plates, pastries, light lunches. No full restaurant mains or service packages.',
  },
};

/**
 * @param {string} verticalSlug
 * @param {string} [businessName]
 * @param {string} [businessType]
 */
export function resolveCuisineMenuBankKey(verticalSlug, businessName = '', businessType = '') {
  const slug = String(verticalSlug || '').toLowerCase().trim();
  if (slug && CUISINE_BANKS[slug]) return slug;

  const resolved = resolveVertical({
    businessType: businessType || verticalSlug,
    businessName,
    explicitVertical: slug || null,
  });
  if (resolved?.slug && CUISINE_BANKS[resolved.slug]) return resolved.slug;

  const blob = `${businessName} ${businessType} ${verticalSlug}`.toLowerCase();
  if (/\b(vietnamese|pho|phở|banh mi|bánh mì|goi cuon|gỏi cuốn|bun bo|bún bò)\b/.test(blob)) {
    return 'food.vietnamese';
  }
  if (/\b(thai|japanese|sushi|ramen|korean|chinese|dumpling|asian)\b/.test(blob)) {
    return 'food.asian';
  }
  if (/\b(burger|fast food|takeaway|take away|kebab|fried chicken)\b/.test(blob)) {
    return 'food.fast_food';
  }
  if (/\b(cafe|coffee|espresso|latte|bakery)\b/.test(blob)) {
    return 'food.cafe';
  }
  if (resolved?.group === 'food' && resolved.slug?.startsWith('food.')) {
    return resolved.slug in CUISINE_BANKS ? resolved.slug : null;
  }
  return null;
}

/**
 * @param {string} verticalSlug
 * @param {string} [businessName]
 * @param {string} [businessType]
 */
export function getCuisineMenuPromptHints(verticalSlug, businessName = '', businessType = '') {
  const key = resolveCuisineMenuBankKey(verticalSlug, businessName, businessType);
  if (!key) return null;
  const bank = CUISINE_BANKS[key];
  const examples = (bank?.items || []).slice(0, 6).map((i) => i.name).join(', ');
  return `${bank.promptHints}\nExample dishes for this cuisine: ${examples}.`;
}

/**
 * @param {object} profile
 * @param {number} [targetCount]
 */
export function buildCuisineMenuCatalog(profile = {}, targetCount = CATALOG_ITEM_LIMIT) {
  const cap = Math.max(CATALOG_ITEM_MIN, Math.min(CATALOG_ITEM_LIMIT, targetCount));
  const key = resolveCuisineMenuBankKey(
    profile.verticalSlug,
    profile.businessName ?? profile.storeName,
    profile.businessType ?? profile.storeType,
  );
  const bank = key ? CUISINE_BANKS[key] : null;
  if (!bank) return null;

  const categories = bank.categories.map((c, i) => ({
    id: `cat_food_${c.key}`,
    name: c.label,
  }));
  const catByKey = Object.fromEntries(bank.categories.map((c, i) => [c.key, categories[i].id]));

  const baseItems = bank.items;
  const items = [];
  for (let i = 0; i < cap; i++) {
    const src = baseItems[i % baseItems.length];
    const catId = catByKey[src.categoryKey] || categories[0].id;
    const suffix =
      i >= baseItems.length
        ? ` ${['', '- Chef\'s', '- Special', '- House'][Math.floor(i / baseItems.length) % 4]}`.trim()
        : '';
    const name = suffix && !src.name.includes(suffix) ? `${src.name}${suffix}` : src.name;
    items.push({
      id: `item_cuisine_${i}`,
      name,
      description: src.description ?? null,
      price: src.price ?? null,
      categoryId: catId,
    });
  }

  return {
    categories,
    items,
    meta: { catalogSource: 'cuisine_template', vertical: key, cuisineLabel: bank.label },
  };
}

/**
 * Map cuisine vertical slug → template key for template mode.
 * @param {string} verticalSlug
 */
export function cuisineSlugToTemplateKey(verticalSlug) {
  const key = resolveCuisineMenuBankKey(verticalSlug);
  if (key === 'food.vietnamese') return 'food_vietnamese';
  if (key === 'food.asian') return 'food_asian';
  if (key === 'food.fast_food') return 'food_fast_food';
  return null;
}

export function isFoodVerticalSlug(verticalSlug) {
  const slug = String(verticalSlug || '').toLowerCase();
  return slug === 'food' || slug.startsWith('food.');
}

export function isFoodBusinessProfile(profile = {}) {
  const group = String(profile.verticalGroup ?? '').toLowerCase();
  if (group === 'food') return true;
  return isFoodVerticalSlug(profile.verticalSlug);
}

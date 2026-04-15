/**
 * Menu categories for food businesses (restaurant, cafe, bakery).
 * Single source of truth: used by (a) initial store generation and (b) auto-categorize.
 * Produces Entrees / Mains / Desserts / Drinks and assigns products by name/description/tags.
 */

const DRINKS_KEYWORDS = [
  'coffee', 'latte', 'cappuccino', 'espresso', 'tea', 'milk tea', 'smoothie', 'juice',
  'soda', 'coke', 'beer', 'wine', 'cocktail', 'water', 'americano', 'mocha', 'cold brew',
  'iced', 'chai', 'matcha', 'hot chocolate', 'lemonade', 'soft drink', 'bottled water',
];
const DESSERTS_KEYWORDS = [
  'dessert', 'cake', 'muffin', 'brownie', 'croissant', 'pastry', 'donut', 'ice cream',
  'tart', 'tiramisu', 'cheesecake', 'cookie', 'pie', 'danish', 'scone', 'éclair',
  'macaron', 'cupcake', 'lava cake', 'pavlova', 'strudel', 'biscotti',
];
const STARTERS_KEYWORDS = [
  'entree', 'starter', 'appetizer', 'appetiser', 'soup', 'salad', 'spring roll',
  'dumpling', 'small plate', 'garlic bread', 'mozzarella sticks', 'wings',
  'side salad', 'coleslaw',
];
const MAINS_KEYWORDS = [
  'main', 'burger', 'pizza', 'pasta', 'steak', 'curry', 'noodle', 'rice', 'bowl',
  'pho', 'banh mi', 'kebab', 'salmon', 'grilled', 'carbonara', 'parmesan',
  'fish and chips', 'stir fry', 'sandwich', 'club', 'wrap', 'kids meal',
  'quiche', 'omelette', 'avocado toast', 'granola bowl', 'breakfast wrap',
];

const MENU_CATEGORY_IDS = ['starters', 'mains', 'desserts', 'drinks'];
const MENU_CATEGORIES = [
  { id: 'starters', name: 'Entrees' },
  { id: 'mains', name: 'Mains' },
  { id: 'desserts', name: 'Desserts' },
  { id: 'drinks', name: 'Drinks' },
];

function normalize(s) {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function textContainsAny(text, keywords) {
  const t = normalize(text);
  return keywords.some((kw) => t.includes(kw));
}

/**
 * True if store type is a food business (restaurant, cafe, bakery, coffee-shop).
 */
function isFoodBusiness(storeType) {
  const t = normalize(storeType);
  return ['restaurant', 'cafe', 'coffee-shop', 'coffee_shop', 'bakery'].includes(t);
}

/**
 * Assign a product to one of starters | mains | desserts | drinks using name, description, tags.
 * Fallback: mains (never use "restaurant" or business type as category).
 */
function assignProductToMenuCategory(product) {
  const name = product?.name ?? '';
  const desc = product?.description ?? '';
  const tags = Array.isArray(product?.tags) ? product.tags.join(' ') : '';
  const combined = [name, desc, tags].join(' ');

  if (textContainsAny(combined, DRINKS_KEYWORDS)) return 'drinks';
  if (textContainsAny(combined, DESSERTS_KEYWORDS)) return 'desserts';
  if (textContainsAny(combined, STARTERS_KEYWORDS)) return 'starters';
  if (textContainsAny(combined, MAINS_KEYWORDS)) return 'mains';

  return 'mains';
}

/**
 * For food businesses: returns { categories, items } with menu sections and each item.categoryId set.
 * For non-food: returns null (caller keeps existing behavior).
 */
function getMenuCategoriesAndAssignments(items, storeType) {
  if (!isFoodBusiness(storeType)) return null;
  if (!Array.isArray(items) || items.length === 0) {
    return { categories: [...MENU_CATEGORIES], items: [] };
  }

  const itemsWithCategoryId = items.map((p, idx) => {
    const categoryId = assignProductToMenuCategory(p);
    return { ...p, id: p.id || `item_${idx}`, categoryId };
  });

  return {
    categories: MENU_CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
    items: itemsWithCategoryId,
  };
}

export {
  isFoodBusiness,
  MENU_CATEGORIES,
  MENU_CATEGORY_IDS,
  assignProductToMenuCategory,
  getMenuCategoriesAndAssignments,
};

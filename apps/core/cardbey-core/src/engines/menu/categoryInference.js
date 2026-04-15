/**
 * Menu Category Inference
 * Automatically infers menu item categories from names and descriptions
 */

// Debug logging helper (gated by environment variable)
const DEBUG_CATEGORY = process.env.DEBUG_MENU_CATEGORY === 'true' || process.env.DEBUG_MENU_CATEGORY === '1';

function debugLog(...args) {
  if (DEBUG_CATEGORY) {
    console.log('[Menu Category Inference]', ...args);
  }
}

/**
 * Normalize text for matching (lowercase, trim, remove punctuation)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

/**
 * Category ruleset - maps keywords to category keys
 */
const CATEGORY_RULES = {
  coffee: [
    'espresso', 'latte', 'cappuccino', 'flat white', 'flatwhite', 'long black', 'longblack',
    'americano', 'macchiato', 'mocha', 'piccolo', 'piccolo latte', 'piccololatte',
    'ristretto', 'doppio', 'lungo', 'affogato', 'cortado', 'breve', 'red eye',
    'black eye', 'cafe au lait', 'cafeaulait', 'vienna', 'irish coffee', 'irishcoffee',
    'cold brew', 'coldbrew', 'iced coffee', 'icedcoffee', 'frappe', 'frappuccino'
  ],
  beverages: [
    'tea', 'chai', 'hot chocolate', 'hotchocolate', 'chocolate', 'juice', 'smoothie',
    'soda', 'water', 'lemonade', 'iced tea', 'icedtea', 'bubble tea', 'bubbletea',
    'boba', 'matcha', 'green tea', 'greentea', 'black tea', 'blacktea', 'herbal tea',
    'herbaltea', 'milkshake', 'shake', 'frappe', 'slushie', 'slush', 'sports drink',
    'sportsdrink', 'energy drink', 'energydrink', 'coffee' // Coffee is also a beverage
  ],
  dessert: [
    'cake', 'slice', 'muffin', 'croissant', 'cookie', 'brownie', 'donut', 'doughnut',
    'pastry', 'pie', 'tart', 'cheesecake', 'tiramisu', 'pudding', 'custard', 'flan',
    'gelato', 'ice cream', 'icecream', 'sorbet', 'macaron', 'eclair', 'cannoli',
    'baklava', 'crepe', 'waffle', 'pancake', 'french toast', 'frenchtoast'
  ],
  food: [
    'sandwich', 'burger', 'wrap', 'salad', 'pizza', 'pasta', 'noodles', 'rice',
    'soup', 'curry', 'stir fry', 'stirfry', 'taco', 'burrito', 'quesadilla',
    'sushi', 'sashimi', 'roll', 'bowl', 'plate', 'meal', 'entree', 'main',
    'appetizer', 'appetiser', 'starter', 'snack', 'finger food', 'fingerfood'
  ]
};

/**
 * Infer menu category key from item name and description
 * @param {Object} params - Item data
 * @param {string} params.name - Item name
 * @param {string} [params.description] - Item description (optional)
 * @returns {Object} { key: string, confidence: number }
 */
export function inferMenuCategoryKey({ name, description = '' }) {
  if (!name || typeof name !== 'string') {
    debugLog('No name provided, returning uncategorized');
    return { key: 'uncategorized', confidence: 0 };
  }

  const normalizedName = normalizeText(name);
  const normalizedDesc = normalizeText(description);
  const combinedText = `${normalizedName} ${normalizedDesc}`.trim();

  if (!combinedText) {
    debugLog('Empty name and description, returning uncategorized');
    return { key: 'uncategorized', confidence: 0 };
  }

  // Score each category based on keyword matches
  const scores = {};
  
  for (const [categoryKey, keywords] of Object.entries(CATEGORY_RULES)) {
    let score = 0;
    let matches = [];

    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      
      // Exact match gets highest score
      if (normalizedName === normalizedKeyword) {
        score += 10;
        matches.push(keyword);
      }
      // Contains keyword gets medium score
      else if (normalizedName.includes(normalizedKeyword) || combinedText.includes(normalizedKeyword)) {
        score += 5;
        matches.push(keyword);
      }
    }

    if (score > 0) {
      scores[categoryKey] = { score, matches };
    }
  }

  // Find category with highest score
  let bestCategory = 'uncategorized';
  let bestScore = 0;
  let bestMatches = [];

  for (const [categoryKey, { score, matches }] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = categoryKey;
      bestMatches = matches;
    }
  }

  // Calculate confidence (0-1 scale)
  // Higher score = higher confidence, but cap at reasonable levels
  const confidence = Math.min(bestScore / 20, 1.0); // Max confidence at score 20+

  debugLog(`Category inferred: "${name}" -> "${bestCategory}" (confidence: ${confidence.toFixed(2)}, matches: ${bestMatches.join(', ')})`);

  return {
    key: bestCategory,
    confidence,
    matches: bestMatches,
  };
}

/**
 * Get display name for a category key
 * @param {string} categoryKey - Category key (e.g., "coffee", "beverages")
 * @returns {string} Display name (e.g., "Coffee", "Beverages")
 */
export function getCategoryDisplayName(categoryKey) {
  const displayNames = {
    coffee: 'Coffee',
    beverages: 'Beverages',
    dessert: 'Dessert',
    food: 'Food',
    uncategorized: 'Uncategorized',
  };

  return displayNames[categoryKey] || categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
}

/**
 * Normalize category name to consistent format
 * Lowercases and trims the category name
 * 
 * @param {string} categoryName - Category name to normalize
 * @returns {string} Normalized category name
 */
export function normalizeCategoryName(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') {
    return null;
  }
  return categoryName.trim().toLowerCase();
}

/**
 * Get display name for a normalized category key
 * Maps normalized keys to proper display names
 */
export function getCategoryDisplayNameFromKey(normalizedKey) {
  const displayNames = {
    'coffee': 'Coffee',
    'beverages': 'Beverages',
    'dessert': 'Dessert',
    'food': 'Food',
    'uncategorized': 'Uncategorized',
  };
  return displayNames[normalizedKey] || normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
}

/**
 * Ensure standard categories exist for a store
 * Returns a map of normalized category name -> display name
 * 
 * @param {string} storeId - Store ID
 * @param {Object} [ctx] - Optional context with db service
 * @returns {Promise<Object>} Map of normalizedName -> displayName
 */
export async function ensureCategoriesForStore(storeId, ctx = {}) {
  const { PrismaClient } = await import('@prisma/client');
  const db = ctx.db || new PrismaClient();

  // Standard categories to ensure exist
  const standardCategories = [
    { normalized: 'coffee', display: 'Coffee' },
    { normalized: 'beverages', display: 'Beverages' },
    { normalized: 'dessert', display: 'Dessert' },
    { normalized: 'food', display: 'Food' },
    { normalized: 'uncategorized', display: 'Uncategorized' },
  ];

  // Build map: normalizedName -> displayName
  // This ensures consistent storage and retrieval
  const categoryMap = {};
  for (const { normalized, display } of standardCategories) {
    categoryMap[normalized] = display;
  }

  // Also create reverse map for lookup: displayName -> normalizedName
  const reverseMap = {};
  for (const { normalized, display } of standardCategories) {
    reverseMap[display.toLowerCase()] = normalized;
    reverseMap[normalized] = normalized; // Also map normalized to itself
  }
  categoryMap._reverse = reverseMap; // Attach reverse map for lookup

  if (process.env.DEBUG_MENU_CATEGORY === 'true') {
    console.log('[Menu Configure] Category map keys:', Object.keys(categoryMap).filter(k => !k.startsWith('_')).join(', '));
  }

  return categoryMap;
}

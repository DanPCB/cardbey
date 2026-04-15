/**
 * Menu Item Deduplication Detection
 * Detects duplicate menu items when extracting from photos
 */

// Debug logging helper (gated by environment variable)
const DEBUG_DEDUPE = process.env.DEBUG_MENU_DEDUPE === 'true' || process.env.DEBUG_MENU_DEDUPE === '1';

function debugLog(...args) {
  if (DEBUG_DEDUPE) {
    console.log('[Menu Dedupe]', ...args);
  }
}

/**
 * Normalize item name for matching
 * @param {string} name - Item name
 * @returns {string} Normalized name
 */
export function normalizeItemName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Distance (0 = identical, higher = more different)
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-1, where 1 = identical)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Detect duplicates between extracted items and existing menu items
 * @param {Object} params - Parameters
 * @param {Array} params.extractedItems - Newly extracted items
 * @param {Array} params.existingItems - Existing menu items from database
 * @param {string} params.storeId - Store ID (for filtering)
 * @returns {Array} Items with dedupe information attached
 */
export async function detectDuplicates({ extractedItems, existingItems, storeId }) {
  if (!extractedItems || extractedItems.length === 0) {
    return extractedItems;
  }

  if (!existingItems || existingItems.length === 0) {
    // No existing items, all are unique
    return extractedItems.map((item) => ({
      ...item,
      dedupe: {
        status: 'unique',
        recommendedAction: 'create_new',
      },
    }));
  }

  // Normalize existing item names for fast lookup
  const existingMap = new Map();
  for (const existing of existingItems) {
    const normalized = normalizeItemName(existing.name);
    if (normalized) {
      if (!existingMap.has(normalized)) {
        existingMap.set(normalized, []);
      }
      existingMap.get(normalized).push(existing);
    }
  }

  // Check each extracted item for duplicates
  const itemsWithDedupe = extractedItems.map((item) => {
    const normalizedName = normalizeItemName(item.name);
    
    // 1. Check for exact match (normalized name)
    const exactMatches = existingMap.get(normalizedName) || [];
    
    if (exactMatches.length > 0) {
      // Exact match found
      const match = exactMatches[0]; // Use first match
      debugLog(`Exact duplicate found: "${item.name}" matches existing "${match.name}"`);
      
      return {
        ...item,
        dedupe: {
          status: 'duplicate',
          match: {
            existingItemId: match.id,
            matchScore: 1.0,
            matchedOn: 'name',
          },
          recommendedAction: 'skip', // Default to skip to prevent accidental overwrites
          replaceFields: [], // User can choose which fields to update
        },
      };
    }

    // 2. Check for fuzzy match (similarity >= 0.9)
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [normalizedExisting, existingItems] of existingMap.entries()) {
      const similarity = calculateSimilarity(normalizedName, normalizedExisting);
      if (similarity >= 0.9 && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = existingItems[0];
      }
    }

    if (bestMatch) {
      debugLog(`Fuzzy duplicate found: "${item.name}" similar to "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
      
      return {
        ...item,
        dedupe: {
          status: 'possible_duplicate',
          match: {
            existingItemId: bestMatch.id,
            matchScore: bestScore,
            matchedOn: 'fuzzy_name',
          },
          recommendedAction: 'skip', // Default to skip
          replaceFields: [],
        },
      };
    }

    // 3. No match found - unique item
    return {
      ...item,
      dedupe: {
        status: 'unique',
        recommendedAction: 'create_new',
      },
    };
  });

  const duplicateCount = itemsWithDedupe.filter((item) => 
    item.dedupe.status === 'duplicate' || item.dedupe.status === 'possible_duplicate'
  ).length;

  debugLog(`Dedupe detection complete: ${duplicateCount} duplicates found out of ${extractedItems.length} items`);

  return itemsWithDedupe;
}

/**
 * Get existing menu items for a store
 * @param {string} storeId - Store ID
 * @param {Object} [ctx] - Optional context with db service
 * @returns {Promise<Array>} Existing menu items
 */
export async function getExistingMenuItems(storeId, ctx = {}) {
  const { PrismaClient } = await import('@prisma/client');
  const db = ctx.db || new PrismaClient();

  const products = await db.product.findMany({
    where: {
      businessId: storeId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      category: true,
      description: true,
      isPublished: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    currency: product.currency,
    category: product.category,
    description: product.description,
    active: product.isPublished,
    updatedAt: product.updatedAt,
  }));
}


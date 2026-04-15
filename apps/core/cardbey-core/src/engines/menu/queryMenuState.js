/**
 * Query Menu State Tool
 * Get current menu items and categories for a store
 */

import { PrismaClient } from '@prisma/client';
import { normalizeCategoryName, getCategoryDisplayNameFromKey } from './categoryInference.js';

const prisma = new PrismaClient();

/**
 * Generate categoryId from category name
 * Creates a consistent ID based on normalized category name
 */
function getCategoryId(storeId, categoryName) {
  if (!categoryName) {
    return `cat-${storeId}-uncategorized`;
  }
  const normalized = normalizeCategoryName(categoryName);
  return `cat-${storeId}-${normalized}`;
}

/**
 * Query menu state
 * Returns all menu items and categories for a store
 */
export const queryMenuState = async (input, ctx) => {
  const { storeId } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;

  // Query menu items
  // Note: This assumes MenuItem model exists
  // If not, we'll use Product model as fallback
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
      imageUrl: true, // Include imageUrl for display
    },
  });

  // Build category map: normalized -> { id, name, count }
  const categoryMap = new Map();
  let uncategorizedCount = 0;
  
  products.forEach((product) => {
    if (product.category) {
      const normalized = normalizeCategoryName(product.category);
      const categoryId = getCategoryId(storeId, product.category);
      
      if (!categoryMap.has(normalized)) {
        categoryMap.set(normalized, {
          id: categoryId,
          name: product.category, // Use stored display name
          normalized,
          count: 0,
        });
      }
      categoryMap.get(normalized).count++;
    } else {
      uncategorizedCount++;
    }
  });

  // Build categories array
  const categories = Array.from(categoryMap.values());
  
  // Add "Uncategorized" category if there are items without categories
  if (uncategorizedCount > 0) {
    categories.push({
      id: `cat-${storeId}-uncategorized`,
      name: 'Uncategorized',
      normalized: 'uncategorized',
      count: uncategorizedCount,
    });
  }

  // Map products to menu items format with categoryId
  const items = products.map((product) => {
    const categoryId = getCategoryId(storeId, product.category);
    const normalized = normalizeCategoryName(product.category);
    
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      category: product.category, // Display name
      categoryId, // Normalized ID for grouping
      normalizedCategory: normalized || 'uncategorized', // Normalized name for grouping
      description: product.description,
      imageUrl: product.imageUrl, // Include imageUrl
    };
  });

  return {
    ok: true,
    data: {
      items,
      categories,
    },
  };
};


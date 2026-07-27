/**
 * Query Menu State Tool
 * Get current menu items and categories for a store
 */

import { normalizeCategoryName } from './categoryInference.js';

import { prisma } from '../../lib/prisma.js';

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

  // Menu is product-backed — preserve null prices (unknown), draft/live, provenance pass-through.
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
      imageUrl: true,
      images: true,
      isPublished: true,
      updatedAt: true,
      itemType: true,
      purchaseEnabled: true,
      serviceCatalog: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
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

  // Build categories array (stable order by first appearance / name)
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
  const items = products.map((product, index) => {
    const categoryId = getCategoryId(storeId, product.category);
    const normalized = normalizeCategoryName(product.category);
    const serviceCatalog =
      product.serviceCatalog && typeof product.serviceCatalog === 'object'
        ? product.serviceCatalog
        : null;

    return {
      id: product.id,
      name: product.name,
      // Preserve unknown prices — do not coerce null to 0
      price: product.price == null ? null : product.price,
      currency: product.currency,
      category: product.category,
      categoryId,
      // Pass-through when present on serviceCatalog / import metadata; do not invent
      categoryPath: serviceCatalog?.categoryPath ?? (product.category ? [product.category] : null),
      sourceOrder: serviceCatalog?.sourceOrder ?? index,
      normalizedCategory: normalized || 'uncategorized',
      description: product.description ?? null,
      imageUrl: product.imageUrl,
      images: product.images ?? null,
      isPublished: product.isPublished === true,
      active: product.purchaseEnabled !== false,
      updatedAt: product.updatedAt ? product.updatedAt.toISOString?.() ?? String(product.updatedAt) : null,
      modifiers: Array.isArray(serviceCatalog?.modifiers) ? serviceCatalog.modifiers : undefined,
      dietaryLabels: Array.isArray(serviceCatalog?.dietaryLabels) ? serviceCatalog.dietaryLabels : undefined,
      provenance: serviceCatalog?.provenance ?? serviceCatalog?.priceProvenance ?? null,
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

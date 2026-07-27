/**
 * Query Menu State Tool
 * Get current menu items and categories for a store (product-backed).
 */

import type { QueryMenuStateInput, QueryMenuStateOutput } from './types.js';
import { normalizeCategoryName } from './categoryInference.js';
import { prisma } from '../../lib/prisma.js';

type PrismaClient = typeof prisma;

interface EngineContext {
  services: {
    db: PrismaClient;
  };
}

function getCategoryId(storeId: string, categoryName: string | null | undefined) {
  if (!categoryName) return `cat-${storeId}-uncategorized`;
  const normalized = normalizeCategoryName(categoryName);
  return `cat-${storeId}-${normalized}`;
}

export const queryMenuState = async (
  input: QueryMenuStateInput,
  ctx?: EngineContext,
): Promise<QueryMenuStateOutput> => {
  const { storeId } = input;
  const db = ctx?.services?.db || prisma;

  const products = await db.product.findMany({
    where: { businessId: storeId, deletedAt: null },
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
      purchaseEnabled: true,
      serviceCatalog: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const categoryMap = new Map<
    string,
    { id: string; name: string; normalized: string; count: number }
  >();
  let uncategorizedCount = 0;

  products.forEach((product) => {
    if (product.category) {
      const normalized = normalizeCategoryName(product.category);
      if (!categoryMap.has(normalized)) {
        categoryMap.set(normalized, {
          id: getCategoryId(storeId, product.category),
          name: product.category,
          normalized,
          count: 0,
        });
      }
      categoryMap.get(normalized)!.count++;
    } else {
      uncategorizedCount++;
    }
  });

  const categories = Array.from(categoryMap.values());
  if (uncategorizedCount > 0) {
    categories.push({
      id: `cat-${storeId}-uncategorized`,
      name: 'Uncategorized',
      normalized: 'uncategorized',
      count: uncategorizedCount,
    });
  }

  const items = products.map((product, index) => {
    const serviceCatalog =
      product.serviceCatalog && typeof product.serviceCatalog === 'object'
        ? (product.serviceCatalog as Record<string, unknown>)
        : null;
    return {
      id: product.id,
      name: product.name,
      price: product.price == null ? null : product.price,
      currency: product.currency,
      category: product.category,
      categoryId: getCategoryId(storeId, product.category),
      categoryPath: (serviceCatalog?.categoryPath as string[] | undefined) ??
        (product.category ? [product.category] : null),
      sourceOrder: (serviceCatalog?.sourceOrder as number | undefined) ?? index,
      description: product.description ?? null,
      imageUrl: product.imageUrl,
      isPublished: product.isPublished === true,
      active: product.purchaseEnabled !== false,
      modifiers: Array.isArray(serviceCatalog?.modifiers) ? serviceCatalog.modifiers : undefined,
      dietaryLabels: Array.isArray(serviceCatalog?.dietaryLabels)
        ? serviceCatalog.dietaryLabels
        : undefined,
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

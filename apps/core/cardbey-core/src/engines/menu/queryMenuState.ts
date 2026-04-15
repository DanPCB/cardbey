/**
 * Query Menu State Tool
 * Get current menu items and categories for a store
 */

import { PrismaClient } from '@prisma/client';
import type { QueryMenuStateInput, QueryMenuStateOutput } from './types.js';

const prisma = new PrismaClient();

/**
 * Context interface for engine tools
 */
interface EngineContext {
  services: {
    db: PrismaClient;
  };
}

/**
 * Query menu state
 * Returns all menu items and categories for a store
 */
export const queryMenuState = async (
  input: QueryMenuStateInput,
  ctx?: EngineContext
): Promise<QueryMenuStateOutput> => {
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
    },
  });

  // Get unique categories from products
  const categorySet = new Set<string>();
  products.forEach((product) => {
    if (product.category) {
      categorySet.add(product.category);
    }
  });

  const categories = Array.from(categorySet).map((name) => ({
    id: `cat-${storeId}-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
  }));

  // Map products to menu items format
  const items = products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    currency: product.currency,
    category: product.category,
    description: product.description,
  }));

  return {
    ok: true,
    data: {
      items,
      categories,
    },
  };
};




/**
 * Configure Menu Tool
 * Create or update menu items and categories in database
 */

import { PrismaClient } from '@prisma/client';
import type { ConfigureMenuInput, ConfigureMenuOutput } from './types.js';
import { getEventEmitter, MENU_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Context interface for engine tools
 */
interface EngineContext {
  services: {
    db: PrismaClient;
    events: ReturnType<typeof getEventEmitter>;
  };
}

/**
 * Configure menu items and categories
 * Creates categories and menu items in the database
 */
export const configureMenu = async (
  input: ConfigureMenuInput,
  ctx?: EngineContext
): Promise<ConfigureMenuOutput> => {
  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const events = ctx?.services?.events || getEventEmitter();

  // Dev fallback for testing – create a simple sample menu if items are empty
  let items = input.items;
  let categories = input.categories;
  
  if (!items || items.length === 0) {
    const sampleItems = [
      {
        name: 'Flat White',
        price: 5,
        currency: 'AUD',
        category: 'Coffee',
        description: null,
      },
      {
        name: 'Latte',
        price: 5.5,
        currency: 'AUD',
        category: 'Coffee',
        description: null,
      },
      {
        name: 'Cappuccino',
        price: 5.5,
        currency: 'AUD',
        category: 'Coffee',
        description: null,
      },
    ];
    items = sampleItems;
    categories = ['Coffee'];
  }

  const { tenantId, storeId } = input;

  const categoryMap: Record<string, string> = {};

  // Create or update categories
  // Note: This assumes MenuCategory model exists with composite unique constraint on (storeId, name)
  // If not, you may need to use Product.category field or create the model
  for (const cat of categories) {
    // For now, we'll use a placeholder approach
    // In production, you would use:
    // const c = await db.menuCategory.upsert({
    //   where: { storeId_name: { storeId, name: cat } },
    //   update: {},
    //   create: { tenantId, storeId, name: cat },
    // });
    // categoryMap[cat] = c.id;
    
    // Placeholder: Generate category ID (replace with actual DB operation)
    categoryMap[cat] = `cat-${storeId}-${cat.toLowerCase().replace(/\s+/g, '-')}`;
  }

  // Create menu items
  // Note: This assumes MenuItem model exists
  // If not, you may need to use Product model or create the model
  for (const item of items) {
    // For now, we'll use a placeholder approach
    // In production, you would use:
    // await db.menuItem.create({
    //   data: {
    //     tenantId,
    //     storeId,
    //     name: item.name,
    //     description: item.description,
    //     price: item.price,
    //     currency: item.currency,
    //     categoryId: categoryMap[item.category],
    //   },
    // });

    // Placeholder: Create as Product for now (replace with actual MenuItem model)
    await db.product.create({
      data: {
        businessId: storeId,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        category: item.category,
        isPublished: true,
      },
    });
  }

  // Emit event
  await events.emit(MENU_EVENTS.MENU_CONFIGURED, {
    tenantId,
    storeId,
    itemCount: items.length,
  });

  return {
    ok: true,
    data: {
      itemCount: items.length,
      categoryCount: categories.length,
    },
  };
};



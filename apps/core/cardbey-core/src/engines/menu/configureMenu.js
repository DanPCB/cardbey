/**
 * Configure Menu Tool
 * Create or update menu items and categories in database
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, MENU_EVENTS } from './events.js';

const prisma = new PrismaClient();

/**
 * Configure menu items and categories
 * Creates categories and menu items in the database
 */
export const configureMenu = async (input, ctx) => {
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

  // Import category normalization helpers
  const { ensureCategoriesForStore, normalizeCategoryName, getCategoryDisplayNameFromKey } = await import('./categoryInference.js');

  // Ensure categories exist and get category map
  const categoryMap = await ensureCategoriesForStore(storeId, { db });
  const reverseMap = categoryMap._reverse || {};

  // Track category assignments for logging
  const categoryAssignments = {};
  Object.keys(categoryMap).filter(k => !k.startsWith('_')).forEach((key) => {
    categoryAssignments[categoryMap[key]] = 0;
  });
  categoryAssignments['Uncategorized'] = 0;

  // Debug log category map
  if (process.env.DEBUG_MENU_CATEGORY === 'true') {
    console.log('[Menu Configure] Category map keys:', Object.keys(categoryMap).filter(k => !k.startsWith('_')).join(', '));
  }

  // Create menu items with normalized categories
  for (const item of items) {
    // Normalize category name from input
    let normalizedCategory = null;
    let displayCategory = null;

    if (item.category) {
      // Normalize the input category name
      const normalized = normalizeCategoryName(item.category);
      
      // Look up in reverse map to get normalized key
      normalizedCategory = reverseMap[normalized] || normalized;
      
      // Get display name from normalized key
      displayCategory = categoryMap[normalizedCategory] || getCategoryDisplayNameFromKey(normalizedCategory) || item.category;
    } else {
      // No category provided - use uncategorized
      normalizedCategory = 'uncategorized';
      displayCategory = 'Uncategorized';
    }

    // Track assignment
    if (displayCategory) {
      categoryAssignments[displayCategory] = (categoryAssignments[displayCategory] || 0) + 1;
    }

    // Debug log for first 3 items
    if (items.indexOf(item) < 3) {
      console.log(`[Menu Configure] Item: ${item.name} -> category: "${item.category}" -> normalized: "${normalizedCategory}" -> display: "${displayCategory}"`);
    }

    // Create as Product (using category field to store normalized category name)
    // We store the normalized name to ensure consistency
    const created = await db.product.create({
      data: {
        businessId: storeId,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        category: displayCategory, // Store display name (normalized internally)
        imageUrl: item.imageUrl || null, // Cropped image URL if available
        isPublished: true,
      },
    });
    
    // Debug log for first few items to verify category is saved
    if (items.indexOf(item) < 3) {
      console.log(`[Menu Engine] Created item: ${created.name} with category: ${created.category || 'null'}, imageUrl: ${created.imageUrl || 'none'}`);
    }
  }

  // Emit event
  await events.emit(MENU_EVENTS.MENU_CONFIGURED, {
    tenantId,
    storeId,
    itemCount: items.length,
  });

  // Log category assignments
  const assignedToCategories = Object.entries(categoryAssignments)
    .filter(([_, count]) => count > 0)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  console.log('[Menu Engine] Saved menu', {
    itemCount: items.length,
    categoryCount: categories.length,
    assignedToCategories: assignedToCategories || 'all uncategorized',
  });

  // Queue image generation if feature enabled (non-blocking)
  // Use robust boolean parsing (supports "true", "1", "yes", "on")
  const menuVisualAgentEnabled = process.env.ENABLE_MENU_VISUAL_AGENT && 
    ['true', '1', 'yes', 'on'].includes(process.env.ENABLE_MENU_VISUAL_AGENT.toLowerCase().trim());
  
  if (menuVisualAgentEnabled) {
    try {
      // Import dynamically to avoid circular dependencies
      const { queueImageGenerationJob } = await import('../../services/menuVisualAgent/imageGenerationJob.js');
      
      // Get created item IDs (we need to query them back since we don't store them)
      // For MVP, we'll queue for all items without images (itemIds = undefined)
      await queueImageGenerationJob(storeId, undefined, tenantId, tenantId).catch(err => {
        console.error('[Menu Engine] Failed to queue image generation job:', err);
        // Non-blocking: log error but don't throw
      });
    } catch (importError) {
      console.error('[Menu Engine] Failed to import image generation job:', importError);
      // Non-blocking: continue even if import fails
    }
  }

  return {
    ok: true,
    data: {
      itemCount: items.length,
      categoryCount: categories.length,
    },
  };
};


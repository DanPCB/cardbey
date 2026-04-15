/**
 * Menu From Photo Flow
 * Orchestrator agent flow for building menus from photo images
 * 
 * Flow: User uploads a menu photo → agent extracts items → configures menu → generates assets → publishes
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import type { ToolContext } from '../runtime/toolExecutor.js';
// Service will be imported dynamically if needed

/**
 * Flow input interface
 */
export interface MenuFromPhotoInput {
  tenantId: string;
  storeId: string;
  imageUrl: string; // image of menu
  theme?: string; // optional theme preference
}

/**
 * Flow result interface
 */
export interface MenuFromPhotoResult {
  ok: boolean;
  flow?: string;
  menuSummary?: unknown;
  assets?: unknown;
  error?: {
    message: string;
  };
}

/**
 * Menu From Photo Flow
 * 
 * Steps:
 * 1. Extract menu items from photo
 * 2. Configure menu with extracted items
 * 3. Generate assets (poster, menu board, item cards)
 * 4. Publish menu
 * 
 * @param input - Flow input parameters
 * @param ctx - Execution context
 * @returns Flow result
 */
export async function menu_from_photo(
  input: MenuFromPhotoInput,
  ctx?: ToolContext
): Promise<MenuFromPhotoResult> {
  try {
    // Use the new service that uses AI engines
    // TODO: Feature flag to switch between old and new implementation
    const useNewService = process.env.USE_AI_ENGINES !== 'false';
    
    if (useNewService) {
      logger.info('[menu_from_photo] Using new AI engine service');
      // Dynamic import to handle JS/TS mix
      const { runMenuFromPhoto: runMenuFromPhotoService } = await import('../services/menuFromPhotoService.js');
      const serviceResult = await runMenuFromPhotoService(input, ctx);
      
      // Convert service result to flow result format
      return {
        ok: true,
        flow: 'menu_from_photo',
        menuSummary: {
          itemCount: serviceResult.payload.items.length,
          categories: [...new Set(serviceResult.payload.items.map((i) => i.category).filter(Boolean))],
        },
        assets: undefined, // TODO: Generate assets if needed
      };
    }
    
    // Legacy implementation (keep for backward compatibility)
    logger.info('[menu_from_photo] Using legacy menu extract tool');
    
    // 1. extract
    logger.info('[menu_from_photo] Step 1: Extracting menu items', {
      tenantId: input.tenantId,
      imageUrl: input.imageUrl,
    });

    const extracted = await callTool(
      'menu.extract',
      {
        tenantId: input.tenantId,
        imageUrl: input.imageUrl,
      },
      ctx
    );

    if (!extracted.ok || !extracted.data) {
      throw new Error(extracted.error || 'Failed to extract menu items');
    }

    logger.info('[menu_from_photo] Menu items extracted', {
      itemsCount: (extracted.data as { structuredItems?: unknown[] }).structuredItems?.length || 0,
    });

    // 2. configure
    logger.info('[menu_from_photo] Step 2: Configuring menu', {
      tenantId: input.tenantId,
      storeId: input.storeId,
    });

    const structuredItems = (extracted.data as { structuredItems: Array<{ category?: string }> }).structuredItems;
    const categories = [...new Set(structuredItems.map((i) => i.category).filter((c): c is string => Boolean(c)))];

    const configured = await callTool(
      'menu.configure',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        items: structuredItems,
        categories,
      },
      ctx
    );

    if (!configured.ok || !configured.data) {
      throw new Error(configured.error || 'Failed to configure menu');
    }

    logger.info('[menu_from_photo] Menu configured');

    // 3. generate assets
    logger.info('[menu_from_photo] Step 3: Generating assets', {
      tenantId: input.tenantId,
      storeId: input.storeId,
      theme: input.theme || 'default',
    });

    const assets = await callTool(
      'menu.generate-assets',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        theme: input.theme || 'default',
        types: ['poster', 'menu_board', 'item_card'],
      },
      ctx
    );

    if (!assets.ok || !assets.data) {
      throw new Error(assets.error || 'Failed to generate assets');
    }

    logger.info('[menu_from_photo] Assets generated');

    // 4. publish
    logger.info('[menu_from_photo] Step 4: Publishing menu', {
      tenantId: input.tenantId,
      storeId: input.storeId,
    });

    const published = await callTool(
      'menu.publish',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
      ctx
    );

    if (!published.ok) {
      throw new Error(published.error || 'Failed to publish menu');
    }

    logger.info('[menu_from_photo] Menu published');

    const result: MenuFromPhotoResult = {
      ok: true,
      flow: 'menu_from_photo',
      menuSummary: configured.data,
      assets: assets.data,
    };

    logger.info('[menu_from_photo] Flow completed successfully');

    return result;
  } catch (err) {
    logger.error('[menu_from_photo] Flow error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        imageUrl: input.imageUrl,
      },
    });

    return {
      ok: false,
      error: {
        message: err instanceof Error ? err.message : 'Menu flow failed',
      },
    };
  }
}


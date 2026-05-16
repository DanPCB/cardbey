/**
 * Signage From Menu Flow
 * Orchestrator agent flow for generating signage from menu items
 * 
 * Flow: User requests menu board → agent generates signage assets and playlist
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import { getEventEmitter } from '../../engines/signage/events.js';

/**
 * Flow input interface
 */
export interface SignageFromMenuInput {
  tenantId: string;
  storeId: string;
  categoryIds?: string[];
  theme?: string;
  autoPublish?: boolean;
}

/**
 * Flow result interface
 */
export interface SignageFromMenuResult {
  ok: boolean;
  flow?: string;
  playlistId?: string;
  assets?: {
    assetIds?: string[];
    assetUrls?: string[];
  };
  error?: {
    message: string;
  };
}

/**
 * Tool context interface
 */
interface FlowContext {
  services?: {
    events?: ReturnType<typeof getEventEmitter>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Signage From Menu Flow
 * 
 * Steps:
 * 1. Query menu state
 * 2. Generate assets from menu
 * 3. Create playlist
 * 4. Add assets to playlist
 * 5. Optionally publish to devices
 * 6. Return UI payload
 * 
 * @param input - Flow input parameters
 * @param ctx - Execution context
 * @returns Flow result
 */
export async function signage_from_menu(
  input: SignageFromMenuInput,
  ctx?: FlowContext
): Promise<SignageFromMenuResult> {
  const { tenantId, storeId, categoryIds, theme, autoPublish } = input;

  try {
    // STEP 1: Get menu
    logger.info('[signage_from_menu] Step 1: Querying menu state', {
      tenantId,
      storeId,
      categoryIds,
    });

    const menuState = await callTool(
      'menu.query-state',
      { tenantId, storeId },
      ctx
    );

    if (!menuState.ok) {
      logger.warn('[signage_from_menu] Menu query failed, continuing anyway', {
        error: menuState.error,
      });
    }

    // STEP 2: Filter items → pass to signage.generate-from-menu
    logger.info('[signage_from_menu] Step 2: Generating assets from menu', {
      storeId,
      categoryIds,
      theme: theme ?? 'default',
    });

    // Try the shorter name first (as per spec), fall back to registered name
    let assets = await callTool(
      'signage.generate-from-menu',
      {
        tenantId,
        storeId,
        categoryIds: categoryIds ?? null,
        theme: theme ?? 'default',
      },
      ctx
    );

    // Fallback to registered tool name if the shorter name doesn't exist
    if (!assets.ok && assets.error?.includes('not found')) {
      logger.info('[signage_from_menu] Trying alternative tool name');
      assets = await callTool(
        'signage.generate-assets-from-menu',
        {
          tenantId,
          storeId,
          filterCategoryIds: categoryIds ?? [],
          theme: theme ?? 'default',
        },
        ctx
      );
    }

    if (!assets.ok || !assets.data) {
      throw new Error(assets.error || 'Failed to generate assets from menu');
    }

    const assetsData = assets.data as {
      assetIds: string[];
      assetUrls: string[];
    };

    logger.info('[signage_from_menu] Assets generated', {
      assetCount: assetsData.assetIds?.length || 0,
    });

    // STEP 3: Create playlist
    logger.info('[signage_from_menu] Step 3: Creating playlist', {
      storeId,
    });

    const playlist = await callTool(
      'signage.create-playlist',
      {
        tenantId,
        storeId,
        name: 'Menu Board',
        description: 'Auto-generated from menu',
      },
      ctx
    );

    if (!playlist.ok || !playlist.data) {
      throw new Error(playlist.error || 'Failed to create playlist');
    }

    const playlistId = (playlist.data as { playlistId: string }).playlistId;

    logger.info('[signage_from_menu] Playlist created', { playlistId });

    // STEP 4: Add assets to playlist
    logger.info('[signage_from_menu] Step 4: Adding assets to playlist', {
      playlistId,
      assetCount: assetsData.assetIds?.length || 0,
    });

    // Convert assetIds to assets array format (as the tool expects)
    const assetsArray = (assetsData.assetIds || []).map((assetId, index) => ({
      assetId,
      url: assetsData.assetUrls?.[index],
      type: 'image' as const,
      duration: 8,
      order: index,
    }));

    const addAssetsRes = await callTool(
      'signage.add-assets-to-playlist',
      {
        tenantId,
        storeId,
        playlistId: playlist.data.playlistId,
        assets: assetsArray,
      },
      ctx
    );

    if (!addAssetsRes.ok) {
      throw new Error(
        addAssetsRes.error || 'Failed to add assets to playlist'
      );
    }

    logger.info('[signage_from_menu] Assets added to playlist');

    // STEP 5: Optionally publish
    if (autoPublish) {
      logger.info('[signage_from_menu] Step 5: Publishing to devices', {
        playlistId,
      });

      const publishRes = await callTool(
        'signage.publish-to-devices',
        {
          tenantId,
          storeId,
          playlistId: playlist.data.playlistId,
        },
        ctx
      );

      if (!publishRes.ok) {
        logger.warn('[signage_from_menu] Failed to publish to devices', {
          error: publishRes.error,
        });
        // Non-critical, continue
      } else {
        logger.info('[signage_from_menu] Published to devices');
      }
    }

    // Build flow result
    const result: SignageFromMenuResult = {
      ok: true,
      flow: 'signage_from_menu',
      playlistId: playlist.data.playlistId,
      assets: assets.data,
    };

    logger.info('[signage_from_menu] Flow completed successfully', {
      playlistId: playlist.data.playlistId,
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    logger.error('[signage_from_menu] Flow error', {
      error: errorMessage,
      stack: errorStack,
      input: {
        tenantId,
        storeId,
        categoryIds,
      },
    });

    return {
      ok: false,
      error: {
        message: errorMessage || 'Signage flow failed',
      },
    };
  }
}


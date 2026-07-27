/**
 * Shopfront Signage Handler
 * Orchestrator handler for shopfront_signage entry point
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import type { ToolContext } from '../runtime/toolExecutor.js';

/**
 * Shopfront Signage Handler Input
 */
export interface ShopfrontSignageInput {
  tenantId: string;
  storeId: string;
  theme?: string;
  filterCategoryIds?: string[];
  autoPublish?: boolean;
  deviceIds?: string[];
}

/**
 * Shopfront Signage Handler Result
 */
export interface ShopfrontSignageResult {
  ok: boolean;
  summary: {
    playlistId?: string;
    assetCount?: number;
    devicesUpdated?: number;
  };
  ids: {
    playlistId?: string;
    assetIds?: string[];
    scheduleIds?: string[];
  };
  nextSteps?: string[];
  error?: {
    message: string;
  };
}

/**
 * Handle shopfront_signage entry point
 * Generates signage from menu and creates playlist
 * 
 * @param input - Handler input parameters
 * @param ctx - Execution context
 * @returns Handler result
 */
export async function handleShopfrontSignage(
  input: ShopfrontSignageInput,
  ctx?: ToolContext
): Promise<ShopfrontSignageResult> {
  try {
    logger.info('[ShopfrontSignage] Starting shopfront signage flow', {
      tenantId: input.tenantId,
      storeId: input.storeId,
    });

    // Step 1: Generate assets from menu
    logger.info('[ShopfrontSignage] Step 1: Generating assets from menu');
    const assetsRes = await callTool(
      'signage.generate-assets-from-menu',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        theme: input.theme || null,
        filterCategoryIds: input.filterCategoryIds || [],
      },
      ctx
    );

    if (!assetsRes.ok || !assetsRes.data) {
      throw new Error(assetsRes.error || 'Failed to generate assets from menu');
    }

    const assetsData = assetsRes.data as {
      assetIds: string[];
      assetUrls: string[];
    };

    logger.info('[ShopfrontSignage] Assets generated', {
      assetCount: assetsData.assetIds.length,
    });

    // Step 2: Create playlist
    logger.info('[ShopfrontSignage] Step 2: Creating playlist');
    const playlistRes = await callTool(
      'signage.create-playlist',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        name: `Shopfront Signage${input.theme ? ` (${input.theme})` : ''}`,
        description: `Generated from menu items${input.filterCategoryIds?.length ? ` - ${input.filterCategoryIds.length} categories` : ''}`,
      },
      ctx
    );

    if (!playlistRes.ok || !playlistRes.data) {
      throw new Error(playlistRes.error || 'Failed to create playlist');
    }

    const playlistId = (playlistRes.data as { playlistId: string }).playlistId;

    // Step 3: Add assets to playlist
    logger.info('[ShopfrontSignage] Step 3: Adding assets to playlist');
    const addAssetsRes = await callTool(
      'signage.add-assets-to-playlist',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        playlistId,
        assets: assetsData.assetIds.map((assetId, index) => ({
          assetId,
          type: 'image' as const,
          duration: 8,
          order: index,
        })),
      },
      ctx
    );

    if (!addAssetsRes.ok) {
      throw new Error(addAssetsRes.error || 'Failed to add assets to playlist');
    }

    // Step 4: Schedule playlist (if deviceIds provided)
    const scheduleIds: string[] = [];
    if (input.deviceIds && input.deviceIds.length > 0) {
      logger.info('[ShopfrontSignage] Step 4: Scheduling playlist to devices');
      for (const deviceId of input.deviceIds) {
        const scheduleRes = await callTool(
          'signage.schedule-playlist',
          {
            tenantId: input.tenantId,
            storeId: input.storeId,
            playlistId,
            deviceId,
          },
          ctx
        );

        if (scheduleRes.ok && scheduleRes.data) {
          scheduleIds.push((scheduleRes.data as { scheduleId: string }).scheduleId);
        }
      }
    }

    // Step 5: Optionally publish to devices
    let devicesUpdated = 0;
    if (input.autoPublish) {
      logger.info('[ShopfrontSignage] Step 5: Publishing to devices');
      const publishRes = await callTool(
        'signage.publish-to-devices',
        {
          tenantId: input.tenantId,
          storeId: input.storeId,
          playlistId,
        },
        ctx
      );

      if (publishRes.ok && publishRes.data) {
        devicesUpdated = (publishRes.data as { devicesUpdated: number }).devicesUpdated;
      }
    }

    const nextSteps: string[] = [];
    if (!input.autoPublish) {
      nextSteps.push('Publish playlist to devices using /api/signage/engine/publish');
    }
    if (!input.deviceIds || input.deviceIds.length === 0) {
      nextSteps.push('Schedule playlist to specific devices using /api/signage/engine/apply-schedule');
    }

    logger.info('[ShopfrontSignage] Flow completed successfully', {
      playlistId,
      assetCount: assetsData.assetIds.length,
    });

    return {
      ok: true,
      summary: {
        playlistId,
        assetCount: assetsData.assetIds.length,
        devicesUpdated,
      },
      ids: {
        playlistId,
        assetIds: assetsData.assetIds,
        scheduleIds,
      },
      nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
    };
  } catch (err) {
    logger.error('[ShopfrontSignage] Flow error', {
      error: err instanceof Error ? err.message : String(err),
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
    });

    return {
      ok: false,
      summary: {},
      ids: {},
      error: {
        message: err instanceof Error ? err.message : 'Shopfront signage flow failed',
      },
    };
  }
}




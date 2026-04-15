/**
 * Add Assets to Playlist Tool
 * Add SignageAsset items to a playlist in order
 */

import { PrismaClient } from '@prisma/client';
import type { AddAssetsToPlaylistInput, AddAssetsToPlaylistOutput } from './types.ts';
import type { EngineContext } from './createPlaylist.ts';

const prisma = new PrismaClient();

/**
 * Register or update MIEntity for a playlist item
 * Helper function for addAssetsToPlaylist
 */
async function registerPlaylistItemMIEntity(
  playlistItem: { id: string; assetId: string; durationS: number },
  asset: any,
  playlist: any,
  userId: string | null
) {
  try {
    const { registerOrUpdateEntity } = await import('../../services/miService.js');
    const {
      buildScreenItemMIBrain,
      inferMediaType,
      buildDimensions,
      inferOrientation,
    } = await import('../../mi/miDeviceHelpers.js');

    if (!asset || !playlistItem) {
      return; // Skip if no asset or item
    }

    // Build context for MI helpers
    const context = {
      tenantId: playlist.tenantId,
      storeId: playlist.storeId,
      campaignId: null,
      userId: userId || null,
      screenOrientation: undefined, // TODO: Get from device/screen if available
    };

    // Use helper functions to build MI data
    const mediaType = inferMediaType({
      type: asset.type,
      mimeType: asset.mimeType || null,
    });
    const dimensions = buildDimensions({
      width: asset.width || null,
      height: asset.height || null,
    });
    const orientation = inferOrientation(
      {
        width: asset.width || null,
        height: asset.height || null,
      },
      context
    );

    // Build file URL
    const fileUrl = asset.url || '';
    const previewUrl = fileUrl;

    // Build MIBrain using helper
    const miBrain = buildScreenItemMIBrain(
      {
        id: playlistItem.id,
        durationS: playlistItem.durationS,
      },
      {
        id: asset.id,
        type: asset.type,
        url: asset.url,
        durationS: asset.durationS || null,
        width: asset.width || null,
        height: asset.height || null,
        mimeType: asset.mimeType || null,
      },
      context
    );

    // Register or update MIEntity
    await registerOrUpdateEntity({
      productId: playlistItem.id,
      productType: 'screen_item',
      mediaType,
      fileUrl,
      previewUrl,
      dimensions,
      orientation,
      durationSec: playlistItem.durationS || asset.durationS || null,
      createdByUserId: userId || playlist.tenantId,
      createdByEngine: 'device_engine_v2',
      sourceProjectId: context.campaignId || null,
      tenantId: playlist.tenantId,
      storeId: playlist.storeId,
      campaignId: context.campaignId || null,
      miBrain,
      status: 'active',
      links: {
        screenItemId: playlistItem.id,
      },
    });
  } catch (err) {
    // Non-critical error, rethrow to be caught by caller
    throw err;
  }
}

/**
 * Add assets to playlist
 * Creates SignageAssets if needed and adds them to playlist as PlaylistItems
 * 
 * @param input - Assets to add with ordering
 * @param ctx - Execution context with services
 * @returns Count of items added
 */
export const addAssetsToPlaylist = async (
  input: AddAssetsToPlaylistInput,
  ctx?: EngineContext
): Promise<AddAssetsToPlaylistOutput> => {
  const { tenantId, storeId, playlistId, assets } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;

  let itemCount = 0;
  const createdItems: Array<{ id: string; assetId: string; durationS: number; asset: any; playlist: any }> = [];

  // Fetch playlist for MIEntity registration
  const playlist = await db.playlist.findUnique({
    where: { id: playlistId },
  });

  if (!playlist) {
    throw new Error(`Playlist ${playlistId} not found`);
  }

  for (const assetData of assets) {
    let assetId = assetData.assetId;
    let asset = null;

    // Create asset if not provided
    if (!assetId && assetData.url) {
      asset = await db.signageAsset.create({
        data: {
          tenantId,
          storeId,
          type: assetData.type,
          url: assetData.url,
          durationS: assetData.duration, // Use durationS field name
          tags: assetData.tags || null,
        },
      });
      assetId = asset.id;
    } else if (assetId) {
      // Fetch existing asset
      asset = await db.signageAsset.findUnique({
        where: { id: assetId },
      });
    }

    if (!assetId || !asset) {
      continue; // Skip if no asset ID or URL
    }

    // Create playlist item
    // Note: Using unified field names (orderIndex, durationS)
    const playlistItem = await db.playlistItem.create({
      data: {
        playlistId,
        assetId,
        orderIndex: assetData.order,
        durationS: assetData.durationOverride || assetData.duration || 8,
      },
      include: {
        asset: true,
      },
    });

    createdItems.push({
      id: playlistItem.id,
      assetId: playlistItem.assetId || '',
      durationS: playlistItem.durationS,
      asset: playlistItem.asset,
      playlist,
    });

    itemCount++;
  }

  // Register MIEntity for each created playlist item (non-blocking)
  const userId = ctx?.userId || tenantId; // Use userId from context if available, fallback to tenantId
  await Promise.all(
    createdItems.map(item =>
      registerPlaylistItemMIEntity(item, item.asset, playlist, userId).catch(err => {
        console.warn(`[addAssetsToPlaylist] Failed to register MIEntity for item ${item.id}:`, err.message);
      })
    )
  );

  return {
    ok: true,
    data: {
      itemCount,
    },
  };
};


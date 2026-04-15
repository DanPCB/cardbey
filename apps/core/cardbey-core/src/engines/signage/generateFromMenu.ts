/**
 * Generate from Menu Tool
 * Generate signage assets from menu items
 */

import { PrismaClient } from '@prisma/client';
import type { GenerateFromMenuInput, GenerateFromMenuOutput } from './types.ts';
import type { EngineContext } from './createPlaylist.ts';

const prisma = new PrismaClient();

/**
 * Generate signage assets from menu
 * Creates image/video assets for menu items using image generation service
 * 
 * @param input - Menu generation parameters (tenant, store, theme, filters)
 * @param ctx - Execution context with services
 * @returns Generated asset IDs and URLs
 */
export const generateFromMenu = async (
  input: GenerateFromMenuInput,
  ctx?: EngineContext
): Promise<GenerateFromMenuOutput> => {
  const { tenantId, storeId, theme, filterCategoryIds } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const imagesService = ctx?.services?.images as {
    generateMenuSignage?: (params: {
      productId: string;
      name: string;
      description: string | null;
      price: number | null;
      category: string | null;
      theme: string;
    }) => Promise<string>;
  } | undefined;

  // Get menu items
  const where: {
    businessId: string;
    deletedAt: null;
    category?: { in: string[] };
  } = {
    businessId: storeId,
    deletedAt: null,
  };

  if (filterCategoryIds && filterCategoryIds.length > 0) {
    where.category = { in: filterCategoryIds };
  }

  const products = await db.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: true,
      imageUrl: true,
    },
  });

  const assetIds: string[] = [];
  const assetUrls: string[] = [];
  const entities: Array<import('../mi/miTypes.js').MIEntity> = [];

  // Import buildMIEntity
  const { buildMIEntity } = await import('../mi/buildMIEntity.js');

  // Generate assets for each menu item
  for (const product of products) {
    let assetUrl: string;
    let assetId: string;

    if (imagesService?.generateMenuSignage) {
      // Use image service to generate signage asset
      assetUrl = await imagesService.generateMenuSignage({
        productId: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        theme: theme || 'default',
      });
    } else {
      // Fallback: Use product image or placeholder
      assetUrl = product.imageUrl || `https://via.placeholder.com/1920x1080?text=${encodeURIComponent(product.name)}`;
    }

    // Create signage asset
    const asset = await db.signageAsset.create({
      data: {
        tenantId,
        storeId,
        type: 'image',
        url: assetUrl,
        durationS: 8, // Default 8 seconds (use durationS field name)
        tags: product.category || null,
      },
    });

    // Build MIEntity for this asset
    // Note: userId might not be available in ctx, use tenantId as fallback
    const miEntity = buildMIEntity({
      productId: asset.id,
      productType: 'poster',
      fileUrl: assetUrl,
      previewUrl: assetUrl,
      mediaType: 'image',
      durationSec: asset.durationS || undefined,
      createdByUserId: (ctx as any)?.userId || tenantId || 'system',
      createdByEngine: 'creative_engine_v3',
      tenantId,
      storeId,
      locales: ['vi-VN', 'en-AU'],
    });

    // Register MIEntity in database
    try {
      const { registerOrUpdateEntity } = await import('../../services/miService.js');
      await registerOrUpdateEntity({
        productId: miEntity.productId,
        productType: miEntity.productType,
        mediaType: miEntity.format.mediaType,
        fileUrl: miEntity.format.fileUrl,
        previewUrl: miEntity.format.previewUrl,
        dimensions: miEntity.format.dimensions,
        orientation: miEntity.format.orientation,
        durationSec: miEntity.format.durationSec,
        createdByUserId: miEntity.origin.createdByUserId,
        createdByEngine: miEntity.origin.createdByEngine,
        sourceProjectId: miEntity.origin.sourceProjectId,
        tenantId: miEntity.miBrain.context?.tenantId,
        storeId: miEntity.miBrain.context?.storeId,
        campaignId: miEntity.miBrain.context?.campaignId,
        miBrain: miEntity.miBrain,
        status: miEntity.miBrain.lifecycle?.status || 'active',
        validFrom: miEntity.miBrain.lifecycle?.validFrom,
        validTo: miEntity.miBrain.lifecycle?.validTo,
        links: {
          creativeAssetId: asset.id,
        },
      });
    } catch (err) {
      console.warn('[generateFromMenu] Failed to register MIEntity:', err);
      // Non-critical, continue
    }

    assetIds.push(asset.id);
    assetUrls.push(assetUrl);
    entities.push(miEntity);
  }

  return {
    ok: true,
    data: {
      assetIds,
      assetUrls,
      entities, // MIEntity array for Stage 1
    },
  };
};


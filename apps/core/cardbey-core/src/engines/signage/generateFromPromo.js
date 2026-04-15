/**
 * Generate from Promo Tool
 * Generate signage assets from active promotions (stub for later)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate signage assets from promos
 * Creates image/video assets for active promotions
 * 
 * This is a stub implementation for future use
 * 
 * @param input - Promo generation parameters
 * @param ctx - Execution context with services
 * @returns Generated asset IDs and URLs
 */
export const generateFromPromo = async (input, ctx) => {
  const { tenantId, storeId, promoIds, theme } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const imagesService = ctx?.services?.images;

  // Get active promos
  const where = {
    tenantId,
    storeId,
    active: true,
  };

  if (promoIds && promoIds.length > 0) {
    where.id = { in: promoIds };
  }

  const promos = await db.promoRule.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      value: true,
    },
  });

  const assetIds = [];
  const assetUrls = [];

  // Generate assets for each promo
  for (const promo of promos) {
    let assetUrl;

    if (imagesService?.generatePromoSignage) {
      // Use image service to generate signage asset
      assetUrl = await imagesService.generatePromoSignage({
        promoId: promo.id,
        name: promo.name,
        type: promo.type,
        value: promo.value,
        theme: theme || 'default',
      });
    } else {
      // Fallback: Placeholder
      assetUrl = `https://via.placeholder.com/1920x1080?text=${encodeURIComponent(promo.name)}`;
    }

    // Create signage asset
    const asset = await db.signageAsset.create({
      data: {
        tenantId,
        storeId,
        type: 'image',
        url: assetUrl,
        durationS: 10, // Default 10 seconds for promo signage
        tags: `promo:${promo.id}`,
      },
    });

    assetIds.push(asset.id);
    assetUrls.push(assetUrl);
  }

  return {
    ok: true,
    data: {
      assetIds,
      assetUrls,
    },
  };
};




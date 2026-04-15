/**
 * Generate from Menu Tool
 * Generate signage assets from menu items
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate signage assets from menu
 * Creates image/video assets for menu items
 */
export const generateFromMenu = async (input, ctx) => {
  const { tenantId, storeId, theme, filterCategoryIds } = input;

  // Use provided context or create default
  const db = ctx?.services?.db || prisma;
  const imagesService = ctx?.services?.images;

  // Get menu items
  const where = {
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

  const assetIds = [];
  const assetUrls = [];

  // Generate assets for each menu item
  for (const product of products) {
    let assetUrl;
    let assetId;

    if (imagesService) {
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
        duration: 8, // Default 8 seconds
        tags: product.category || null,
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




/**
 * Menu Photo Assignment Routes
 * Assigns extracted dish photos to store products
 * 
 * @typedef {Object} MenuPhotoAssignment
 * @property {string} productId - Product ID
 * @property {string} cropAssetId - Media asset ID of the crop to assign
 * 
 * @typedef {Object} MenuPhotoAssignmentRequest
 * @property {string} storeId - Store/Business ID (Products use businessId)
 * @property {MenuPhotoAssignment[]} assignments - Array of product-to-asset assignments
 * 
 * @typedef {Object} MenuPhotoAssignmentResponse
 * @property {boolean} ok - Success flag
 * @property {number} updatedCount - Number of products updated
 * @property {Object[]} updatedProducts - Array of updated product objects
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/menu-photo-assign
 * Assign dish photos (crop assets) to products
 * 
 * Request body:
 *   {
 *     "storeId": "store_xxx",  // Business ID (Products use businessId)
 *     "assignments": [
 *       {
 *         "productId": "prod_1",
 *         "cropAssetId": "asset_crop_1"
 *       },
 *       {
 *         "productId": "prod_2",
 *         "cropAssetId": "asset_crop_2"
 *       }
 *     ]
 *   }
 * 
 * Response:
 *   {
 *     ok: true,
 *     updatedCount: number,
 *     updatedProducts: Array<Product>
 *   }
 */
router.post('/menu-photo-assign', requireAuth, async (req, res, next) => {
  try {
    const { storeId, assignments } = req.body;
    
    // Validate required fields
    if (!storeId) {
      return res.status(400).json({
        ok: false,
        error: 'missing_store_id',
        message: 'storeId is required',
      });
    }
    
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'missing_assignments',
        message: 'assignments array is required and must not be empty',
      });
    }
    
    // Validate each assignment
    for (const assignment of assignments) {
      if (!assignment.productId || !assignment.cropAssetId) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_assignment',
          message: 'Each assignment must have productId and cropAssetId',
        });
      }
    }
    
    // Note: Products use businessId, but the user may pass storeId
    // For now, we'll treat storeId as businessId (they may be the same)
    // TODO: Add proper mapping if storeId != businessId
    const businessId = storeId;
    
    // Get all product IDs to validate
    const productIds = assignments.map(a => a.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        businessId,
      },
      select: {
        id: true,
        businessId: true,
      },
    });
    
    // Check if all products exist and belong to the store
    const foundProductIds = new Set(products.map(p => p.id));
    const missingProducts = productIds.filter(id => !foundProductIds.has(id));
    
    if (missingProducts.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'products_not_found',
        message: `Products not found or do not belong to store: ${missingProducts.join(', ')}`,
        missingProductIds: missingProducts,
      });
    }
    
    // Validate all crop assets exist
    const cropAssetIds = [...new Set(assignments.map(a => a.cropAssetId))];
    const assets = await prisma.media.findMany({
      where: {
        id: { in: cropAssetIds },
      },
      select: {
        id: true,
        url: true,
      },
    });
    
    const foundAssetIds = new Set(assets.map(a => a.id));
    const missingAssets = cropAssetIds.filter(id => !foundAssetIds.has(id));
    
    if (missingAssets.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'assets_not_found',
        message: `Crop assets not found: ${missingAssets.join(', ')}`,
        missingAssetIds: missingAssets,
      });
    }
    
    // Create a map of assetId -> url for quick lookup
    const assetUrlMap = new Map(assets.map(a => [a.id, a.url]));
    
    // Update products
    const updatedProducts = [];
    
    for (const assignment of assignments) {
      const assetUrl = assetUrlMap.get(assignment.cropAssetId);
      
      if (!assetUrl) {
        console.warn('[MenuPhotoAssign] Asset URL not found for', assignment.cropAssetId);
        continue;
      }
      
      const updated = await prisma.product.update({
        where: {
          id: assignment.productId,
        },
        data: {
          imageUrl: assetUrl, // Products use imageUrl field
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          price: true,
          businessId: true,
          updatedAt: true,
        },
      });
      
      updatedProducts.push(updated);
    }
    
    console.log('[MenuPhotoAssign] Products updated', {
      storeId: businessId,
      updatedCount: updatedProducts.length,
    });
    
    res.json({
      ok: true,
      updatedCount: updatedProducts.length,
      updatedProducts,
    });
  } catch (error) {
    console.error('[MenuPhotoAssign] Error:', error);
    res.status(500).json({
      ok: false,
      error: 'assignment_failed',
      message: error.message || 'Failed to assign photos to products',
    });
  }
});

export default router;


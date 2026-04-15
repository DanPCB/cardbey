/**
 * Catalog Routes
 * SAM-3 catalog processing endpoints
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { processCatalogFromUrls, reprocessAllProducts } from '../orchestrator/services/sam3CatalogService.js';

const router = express.Router();

/**
 * POST /api/catalog/process
 * Process array of image URLs with SAM-3 cutout
 * 
 * Request body:
 *   - imageUrls: string[] (required, max 50)
 *   - businessId?: string (optional)
 * 
 * Response:
 *   - ok: boolean
 *   - jobId: string
 *   - total: number
 *   - processed: number
 *   - successful: number
 *   - failed: number
 *   - results: Array<{success, productId, cutoutPath, error}>
 */
router.post('/process', requireAuth, async (req, res, next) => {
  try {
    const { imageUrls, businessId } = req.body;

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        message: 'imageUrls must be a non-empty array',
      });
    }

    if (imageUrls.length > 50) {
      return res.status(400).json({
        ok: false,
        error: 'Too many images',
        message: 'Maximum 50 images allowed per batch',
      });
    }

    // Use user's businessId if not provided
    const resolvedBusinessId = businessId || req.user?.business?.id;

    const result = await processCatalogFromUrls(imageUrls, resolvedBusinessId);

    if (result.ok) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('[Catalog] Process error:', error);
    next(error);
  }
});

/**
 * POST /api/catalog/reprocess-all
 * Reprocess all products in catalog with SAM-3 (admin only)
 * 
 * Request body:
 *   - businessId?: string (optional, filter by business)
 * 
 * Response:
 *   - ok: boolean
 *   - jobId: string
 *   - total: number
 *   - processed: number
 *   - successful: number
 *   - failed: number
 */
router.post('/reprocess-all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { businessId } = req.body;

    const result = await reprocessAllProducts(businessId);

    if (result.ok) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('[Catalog] Reprocess all error:', error);
    next(error);
  }
});

export default router;














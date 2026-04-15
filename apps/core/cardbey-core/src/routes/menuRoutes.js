/**
 * Menu Engine API Routes
 * Exposes menu engine tools as HTTP endpoints
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getEventEmitter } from '../engines/menu/events.js';
import { generateImageUrlForDraftItem, generateImageCandidatesForDraftItem } from '../services/menuVisualAgent/menuVisualAgent.ts';
import { configureMenu } from '../engines/menu/configureMenu.js';
import { extractMenu } from '../engines/menu/extractMenu.js';
import { queryMenuState } from '../engines/menu/queryMenuState.js';
import { queueImageGenerationJob } from '../services/menuVisualAgent/imageGenerationJob.js';
import { normalizeMenuItemName } from '../services/menuDedupe.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Create engine context with services
 */
function createEngineContext() {
  return {
    services: {
      db: prisma,
      events: getEventEmitter(),
    },
  };
}

/**
 * POST /api/menu/configure-from-photo
 * Configure menu items from extracted photo data
 */
router.post('/configure-from-photo', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId, items } = req.body;

    console.log('[MENU] configure-from-photo', {
      tenantId,
      storeId,
      itemCount: items?.length || 0,
    });

    // Validate input
    if (!tenantId || !storeId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'tenantId and storeId are required',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid items',
        message: 'At least one item is required',
      });
    }

    // Import category normalization helpers
    const { ensureCategoriesForStore, normalizeCategoryName } = await import('../engines/menu/categoryInference.js');

    // Ensure categories exist and get category map
    const categoryMap = await ensureCategoriesForStore(storeId, { db: prisma });
    const reverseMap = categoryMap._reverse || {};

    // Debug logging
    const DEBUG_DEDUPE = process.env.DEBUG_MENU_DEDUPE === 'true' || process.env.DEBUG_MENU_DEDUPE === '1';

    if (DEBUG_DEDUPE) {
      console.log('[Menu Dedupe] Starting configure-from-photo', {
        tenantId,
        storeId,
        incomingItemsCount: items.length,
      });
    }

    // A) Load existing products for this store
    const existingProducts = await prisma.product.findMany({
      where: {
        businessId: storeId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        category: true,
        imageUrl: true,
        price: true,
        currency: true,
        description: true,
        isPublished: true,
      },
    });

    if (DEBUG_DEDUPE) {
      console.log('[Menu Dedupe] Existing products count:', existingProducts.length);
    }

    // B) Build map of normalized name -> existing product
    const byNormalizedName = new Map();
    
    // Handle products with normalizedName
    existingProducts.forEach((product) => {
      if (product.normalizedName) {
        byNormalizedName.set(product.normalizedName, product);
      }
    });

    // C) Backfill normalizedName for legacy products (one-time, cheap)
    const productsNeedingBackfill = existingProducts.filter((p) => !p.normalizedName);
    if (productsNeedingBackfill.length > 0) {
      if (DEBUG_DEDUPE) {
        console.log(`[Menu Dedupe] Backfilling normalizedName for ${productsNeedingBackfill.length} legacy products`);
      }

      // Update in batches to avoid overwhelming the database
      for (const product of productsNeedingBackfill) {
        const normalized = normalizeMenuItemName(product.name);
        try {
          await prisma.product.update({
            where: { id: product.id },
            data: { normalizedName: normalized },
          });
          // Add to map after backfill
          if (!byNormalizedName.has(normalized)) {
            byNormalizedName.set(normalized, { ...product, normalizedName: normalized });
          }
        } catch (err) {
          // If update fails (e.g., unique constraint violation), skip
          if (DEBUG_DEDUPE) {
            console.warn(`[Menu Dedupe] Failed to backfill normalizedName for product ${product.id}:`, err.message);
          }
        }
      }
    }

    // D) Process incoming items with deduplication
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // Track created items in this request to avoid duplicates within same request
    const createdInThisRequest = new Set();

    for (const item of items) {
      const itemName = item.name || 'Unnamed Item';
      const normalized = normalizeMenuItemName(itemName);

      // Check if already created in this request
      if (createdInThisRequest.has(normalized)) {
        skippedCount++;
        if (DEBUG_DEDUPE) {
          console.log(`[Menu Dedupe] Skipping duplicate within request: "${itemName}" -> norm="${normalized}"`);
        }
        continue;
      }

      // Normalize category
      let categoryName = item.category || null;
      if (categoryName) {
        const normalizedCat = normalizeCategoryName(categoryName);
        const normalizedKey = reverseMap[normalizedCat] || normalizedCat;
        categoryName = categoryMap[normalizedKey] || categoryName;
      }

      const existing = byNormalizedName.get(normalized);

      if (existing) {
        // E) UPDATE existing product (safe fields only)
        const updateData = {};

        // Update category if provided and different
        if (categoryName && categoryName !== existing.category) {
          updateData.category = categoryName;
        }

        // Update imageUrl if existing is empty and new has one
        if (item.imageUrl && !existing.imageUrl) {
          updateData.imageUrl = item.imageUrl;
        }

        // DO NOT overwrite: price, description, isPublished (safe v1)

        if (Object.keys(updateData).length > 0) {
          try {
            await prisma.product.update({
              where: { id: existing.id },
              data: updateData,
            });
            updatedCount++;

            if (DEBUG_DEDUPE && updatedCount <= 3) {
              console.log(`[Menu Dedupe] Updated existing: "${itemName}" -> norm="${normalized}" -> id=${existing.id}`, updateData);
            }
          } catch (err) {
            console.error(`[Menu Dedupe] Failed to update product ${existing.id}:`, err.message);
            skippedCount++;
          }
        } else {
          skippedCount++;
          if (DEBUG_DEDUPE && skippedCount <= 3) {
            console.log(`[Menu Dedupe] Skipped (no changes): "${itemName}" -> norm="${normalized}" -> id=${existing.id}`);
          }
        }
      } else {
        // F) CREATE new product
        try {
          const created = await prisma.product.create({
            data: {
              businessId: storeId,
              name: itemName,
              normalizedName: normalized,
              category: categoryName,
              price: item.price ?? 0,
              currency: item.currency ?? 'AUD',
              description: item.description ?? null,
              imageUrl: item.imageUrl || null,
              isPublished: false, // Default to false (safe v1)
            },
          });

          createdCount++;
          createdInThisRequest.add(normalized);
          byNormalizedName.set(normalized, created); // Add to map to prevent duplicates in same request

          if (DEBUG_DEDUPE && createdCount <= 3) {
            console.log(`[Menu Dedupe] Created new: "${itemName}" -> norm="${normalized}" -> id=${created.id}`);
          }
        } catch (err) {
          // Handle unique constraint violation (race condition)
          if (err.code === 'P2002' || err.message?.includes('unique')) {
            skippedCount++;
            if (DEBUG_DEDUPE) {
              console.log(`[Menu Dedupe] Skipped (unique constraint): "${itemName}" -> norm="${normalized}"`);
            }
          } else {
            console.error(`[Menu Dedupe] Failed to create product "${itemName}":`, err.message);
            skippedCount++;
          }
        }
      }
    }

    if (DEBUG_DEDUPE) {
      console.log('[Menu Dedupe] Summary:', {
        createdCount,
        updatedCount,
        skippedCount,
        totalProcessed: items.length,
      });
    }

    // Emit event
    const events = getEventEmitter();
    await events.emit('menu.menu_configured', {
      tenantId,
      storeId,
      itemCount: createdCount + updatedCount,
      createdCount,
      updatedCount,
    });

    return res.json({
      ok: true,
      createdCount,
      updatedCount,
      skippedCount,
      dedupeKey: 'normalizedName',
    });
  } catch (error) {
    console.error('[MENU] configure-from-photo error:', error);
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal error',
    });
  }
});

/**
 * POST /api/menu/extract
 * Extract menu items from a photo
 */
router.post('/extract', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId, imageUrl, ocrText, detectedItems, locale } = req.body;
    
    // Try to get storeId from query params if not in body
    const finalStoreId = storeId || req.query.storeId;
    
    // If still no storeId, try to get from user's business
    let resolvedStoreId = finalStoreId;
    if (!resolvedStoreId && req.userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          include: { business: true },
        });
        if (user?.business) {
          resolvedStoreId = user.business.id;
        }
      } catch (err) {
        // Ignore error, storeId will remain null
      }
    }

    console.log('[MENU] extract', {
      tenantId,
      storeId: resolvedStoreId,
      imageUrl: imageUrl ? 'provided' : 'missing',
      ocrText: ocrText ? `${ocrText.length} chars` : 'missing',
      detectedItems: detectedItems ? `${detectedItems.length} items` : 'none',
      locale: locale || 'en',
    });

    // Validate input
    if (!tenantId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'tenantId is required',
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'imageUrl is required',
      });
    }

    // storeId is optional - if provided, items will be auto-saved
    // If not provided, extraction will still work but items won't be saved

    // Call menu engine tool (menu.extract)
    const result = await extractMenu(
      {
        tenantId,
        storeId: resolvedStoreId || null, // Pass null if not provided
        imageUrl,
        ocrText: ocrText || undefined, // Optional OCR text
        detectedItems: detectedItems || undefined, // Optional detected items
        locale: locale || undefined, // Optional locale
      },
      createEngineContext()
    );

    return res.json(result);
  } catch (error) {
    console.error('[MENU] extract error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal error',
    });
  }
});

/**
 * GET /api/menu/items
 * Get menu items for a store
 */
router.get('/items', requireAuth, async (req, res) => {
  try {
    const { tenantId, storeId } = req.query;

    console.log('[MENU] items', {
      tenantId,
      storeId,
    });

    // Validate input
    if (!tenantId || !storeId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'tenantId and storeId are required',
      });
    }

    // Call menu engine tool (menu.query-state)
    const result = await queryMenuState(
      {
        tenantId,
        storeId,
      },
      createEngineContext()
    );

    return res.json(result);
  } catch (error) {
    console.error('[MENU] items error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal error',
    });
  }
});

/**
 * POST /api/menu/images/suggest
 * Suggest image(s) for menu items (draft or committed). Uses Pexels first, DALL·E fallback.
 * Body: { storeId?, items: [{ itemId, name, description? }], aspect?, mode: 'preview'|'normal' }
 * Returns: { ok, updated: [{ itemId, candidates?: [...], imageUrl? }], failed? }
 */
router.post('/images/suggest', optionalAuth, async (req, res) => {
  try {
    const { storeId, items, aspect, mode, audience } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid items',
        message: 'items array is required and must not be empty',
      });
    }
    const styleName = 'modern'; // Could be derived from storeId/store type later
    const suggestLimit = Math.min(20, Math.max(1, parseInt(req.body.candidatesLimit, 10) || 8)); // default 8 for preview
    const results = [];
    const failed = [];
    for (const item of items) {
      const itemId = item.itemId || item.id;
      const name = item.name || 'Product';
      const description = item.description || null;
      try {
        if (mode === 'preview') {
          const candidates = await generateImageCandidatesForDraftItem(name, description, styleName, suggestLimit, audience);
          if (candidates.length > 0) {
            results.push({ itemId, candidates });
          } else {
            failed.push({ itemId, error: 'No image suggestions found' });
          }
        } else {
          const url = await generateImageUrlForDraftItem(name, description, styleName);
          if (url) {
            results.push({ itemId, imageUrl: url });
          } else {
            failed.push({ itemId, error: 'No image found' });
          }
        }
      } catch (err) {
        failed.push({ itemId, error: err?.message || 'Image suggestion failed' });
      }
    }
    return res.json({
      ok: true,
      updated: results,
      ...(failed.length > 0 && { failed }),
    });
  } catch (error) {
    console.error('[MENU] images/suggest error:', error);
    return res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to suggest images' },
    });
  }
});

/**
 * POST /api/menu/regenerate-image
 * Regenerate image for a specific menu item
 */
router.post('/regenerate-image', requireAuth, async (req, res) => {
  try {
    const { itemId, storeId } = req.body;
    const userId = req.user?.id;

    // Validate input
    if (!itemId || !storeId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        message: 'itemId and storeId are required',
      });
    }

    // Check feature flag (robust boolean parsing)
    const menuVisualAgentEnabled = process.env.ENABLE_MENU_VISUAL_AGENT && 
      ['true', '1', 'yes', 'on'].includes(process.env.ENABLE_MENU_VISUAL_AGENT.toLowerCase().trim());
    
    if (!menuVisualAgentEnabled) {
      return res.status(403).json({
        ok: false,
        error: 'Feature not enabled',
        message: 'Menu Visual Agent feature is not enabled',
      });
    }

    // Queue single-item job
    const taskId = await queueImageGenerationJob(storeId, [itemId], userId, userId);

    return res.json({
      ok: true,
      message: 'Image regeneration queued',
      taskId,
    });
  } catch (error) {
    console.error('[MENU] regenerate-image error:', error);

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal error',
    });
  }
});

/**
 * POST /api/menu/debug/grid-crop
 * Debug endpoint for testing grid cropping (dev only)
 */
router.post('/debug/grid-crop', requireAuth, async (req, res) => {
  // Guard: Only allow in dev or if admin
  if (process.env.NODE_ENV === 'production') {
    // In production, require admin check (you can add admin middleware here)
    // For now, just block it
    return res.status(403).json({
      ok: false,
      error: 'Not available in production',
      message: 'This endpoint is only available in development mode',
    });
  }

  try {
    const { imageUrl, cols, rows, photoRatio, padPx } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field',
        message: 'imageUrl is required',
      });
    }

    const { gridCropMenuImages } = await import('../menu/imageExtractors/gridCropExtractor.js');
    const { uploadCropImage } = await import('../menu/imageExtractors/uploadCrop.js');

    // Use provided params or defaults
    const finalCols = parseInt(cols || process.env.MENU_GRID_COLS || '4', 10);
    const finalRows = parseInt(rows || process.env.MENU_GRID_ROWS || '3', 10);
    const finalPhotoRatio = parseFloat(photoRatio || process.env.MENU_GRID_PHOTO_RATIO || '0.62');
    const finalPadPx = parseInt(padPx || process.env.MENU_GRID_PAD_PX || '6', 10);

    console.log('[MENU DEBUG] Grid crop test', {
      imageUrl,
      cols: finalCols,
      rows: finalRows,
      photoRatio: finalPhotoRatio,
      padPx: finalPadPx,
    });

    // Crop images
    const cropResult = await gridCropMenuImages({
      imageUrl,
      cols: finalCols,
      rows: finalRows,
      photoRatio: finalPhotoRatio,
      padPx: finalPadPx,
      removeOverlay: true,
    });

    if (!cropResult.ok || !cropResult.crops || cropResult.crops.length === 0) {
      return res.status(500).json({
        ok: false,
        error: 'Crop failed',
        message: 'Failed to generate crops',
      });
    }

    // Upload crops
    const { randomUUID } = await import('crypto');
    const extractionId = randomUUID().substring(0, 8);
    const storeId = req.body.storeId || 'debug-store';

    const uploadPromises = cropResult.crops.map((crop) =>
      uploadCropImage({
        buffer: crop.buffer,
        filename: `menu-crop-debug-${extractionId}-${crop.index}.jpg`,
        storeId,
        extractionId,
        index: crop.index,
      }).catch((err) => {
        console.error(`[MENU DEBUG] Failed to upload crop ${crop.index}:`, err.message);
        return null;
      })
    );

    const uploadedCrops = await Promise.all(uploadPromises);
    const urls = uploadedCrops
      .filter((crop) => crop !== null)
      .map((crop) => crop.url);

    return res.json({
      ok: true,
      urls,
      count: urls.length,
      cropsGenerated: cropResult.crops.length,
    });
  } catch (error) {
    console.error('[MENU DEBUG] Grid crop error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal error',
    });
  }
});

export default router;


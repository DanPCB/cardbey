/**
 * SAM-3 Catalog Service
 * Processes entire product catalogs with real SAM-3 for background removal
 * 
 * Features:
 * - Batch processing of up to 50 images
 * - Parallel processing (max 4 concurrent)
 * - Saves cutouts to /public/catalog-cutouts/
 * - Updates Product database records
 * - Progress reporting via SSE
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { runSam3DesignTask } from './sam3DesignTaskService.js';
import { broadcastSse } from '../../realtime/simpleSse.js';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const MAX_CONCURRENT = 4;
const MAX_IMAGES = 50;
const CUTOUT_DIR = path.join(process.cwd(), 'public', 'catalog-cutouts');

// Ensure cutout directory exists
async function ensureCutoutDir() {
  try {
    await fs.mkdir(CUTOUT_DIR, { recursive: true });
  } catch (error) {
    logger.error('[SAM3Catalog] Failed to create cutout directory', { error: error.message });
    throw error;
  }
}

/**
 * Process a single product image with SAM-3 cutout
 * 
 * @param {Object} product - Product record from database
 * @param {string} imageUrl - Image URL to process
 * @param {string} jobId - Job ID for progress tracking
 * @returns {Promise<Object>} Result with success status and cutout path
 */
async function processProductCutout(product, imageUrl, jobId) {
  try {
    logger.info('[SAM3Catalog] Processing product cutout', {
      productId: product.id,
      productName: product.name,
      imageUrl: imageUrl.substring(0, 50),
      jobId,
    });

    // Run SAM-3 product_cutout mode
    const result = await runSam3DesignTask({
      entryPoint: 'content_studio',
      mode: 'product_cutout',
      target: 'image',
      imageUrl,
      userPrompt: '', // Not needed for product_cutout
    });

    if (!result.ok || !result.result?.cutoutUrl) {
      throw new Error(result.error || 'Failed to generate cutout');
    }

    // Extract base64 data from data URL
    const cutoutDataUrl = result.result.cutoutUrl;
    const base64Data = cutoutDataUrl.replace(/^data:image\/png;base64,/, '');
    const cutoutBuffer = Buffer.from(base64Data, 'base64');

    // Generate filename
    const filename = `${product.id}-${Date.now()}.png`;
    const cutoutPath = path.join(CUTOUT_DIR, filename);
    const publicPath = `/catalog-cutouts/${filename}`;

    // Save cutout file
    await fs.writeFile(cutoutPath, cutoutBuffer);

    // Update product in database
    await prisma.product.update({
      where: { id: product.id },
      data: {
        hasSam3Cutout: true,
        cutoutPath: publicPath,
      },
    });

    logger.info('[SAM3Catalog] Product cutout saved', {
      productId: product.id,
      cutoutPath: publicPath,
      jobId,
    });

    return {
      success: true,
      productId: product.id,
      productName: product.name,
      cutoutPath: publicPath,
      refinedBox: result.result.refinedBox,
      score: result.result.score,
    };

  } catch (error) {
    logger.error('[SAM3Catalog] Product cutout failed', {
      productId: product.id,
      error: error.message,
      jobId,
    });

    return {
      success: false,
      productId: product.id,
      productName: product.name,
      error: error.message,
    };
  }
}

/**
 * Process batch of products with concurrency control
 * 
 * @param {Array} products - Array of products with imageUrl
 * @param {string} jobId - Job ID for progress tracking
 * @returns {Promise<Object>} Batch processing results
 */
async function processBatch(products, jobId) {
  const results = [];
  const total = products.length;
  let processed = 0;
  let successful = 0;
  let failed = 0;

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < products.length; i += MAX_CONCURRENT) {
    const batch = products.slice(i, i + MAX_CONCURRENT);
    
    const batchResults = await Promise.all(
      batch.map(product => processProductCutout(product, product.imageUrl, jobId))
    );

    for (const result of batchResults) {
      results.push(result);
      processed++;
      
      if (result.success) {
        successful++;
      } else {
        failed++;
      }

      // Broadcast progress via SSE
      broadcastSse('admin', 'catalog.processing.progress', {
        jobId,
        processed,
        total,
        successful,
        failed,
        currentProduct: result.productName,
        percentage: Math.round((processed / total) * 100),
      });
    }
  }

  return {
    total,
    processed,
    successful,
    failed,
    results,
  };
}

/**
 * Process catalog from image URLs
 * 
 * @param {Array<string>} imageUrls - Array of image URLs (up to 50)
 * @param {string} [businessId] - Optional business ID to associate products
 * @returns {Promise<Object>} Processing results
 */
export async function processCatalogFromUrls(imageUrls, businessId = null) {
  const jobId = `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    // Validate input
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new Error('imageUrls must be a non-empty array');
    }

    if (imageUrls.length > MAX_IMAGES) {
      throw new Error(`Maximum ${MAX_IMAGES} images allowed per batch`);
    }

    // Ensure cutout directory exists
    await ensureCutoutDir();

    logger.info('[SAM3Catalog] Starting catalog processing', {
      jobId,
      imageCount: imageUrls.length,
      businessId,
    });

    // Broadcast start event
    broadcastSse('admin', 'catalog.processing.started', {
      jobId,
      total: imageUrls.length,
      startedAt: new Date().toISOString(),
    });

    // Create or find products for each image URL
    const products = [];
    for (const imageUrl of imageUrls) {
      let product;
      
      if (businessId) {
        // Try to find existing product by imageUrl
        product = await prisma.product.findFirst({
          where: {
            businessId,
            imageUrl,
          },
        });

        // Create if not found
        if (!product) {
          product = await prisma.product.create({
            data: {
              businessId,
              name: `Product ${Date.now()}`,
              imageUrl,
              isPublished: false,
            },
          });
        }
      } else {
        // Use user's businessId if available, otherwise require it
        const userBusinessId = businessId || null;
        if (!userBusinessId) {
          throw new Error('businessId is required when processing catalog images');
        }
        
        // Try to find existing product by imageUrl
        product = await prisma.product.findFirst({
          where: {
            businessId: userBusinessId,
            imageUrl,
          },
        });

        // Create if not found
        if (!product) {
          product = await prisma.product.create({
            data: {
              businessId: userBusinessId,
              name: `Product ${Date.now()}`,
              imageUrl,
              isPublished: false,
            },
          });
        }
      }

      products.push(product);
    }

    // Process batch
    const batchResults = await processBatch(products, jobId);

    // Broadcast completion event
    broadcastSse('admin', 'catalog.processing.completed', {
      jobId,
      ...batchResults,
      completedAt: new Date().toISOString(),
    });

    logger.info('[SAM3Catalog] Catalog processing completed', {
      jobId,
      ...batchResults,
    });

    return {
      ok: true,
      jobId,
      ...batchResults,
    };

  } catch (error) {
    logger.error('[SAM3Catalog] Catalog processing failed', {
      jobId,
      error: error.message,
      stack: error.stack,
    });

    // Broadcast error event
    broadcastSse('admin', 'catalog.processing.error', {
      jobId,
      error: error.message,
      failedAt: new Date().toISOString(),
    });

    return {
      ok: false,
      jobId,
      error: error.message,
    };
  }
}

/**
 * Reprocess all products in catalog (admin only)
 * 
 * @param {string} [businessId] - Optional business ID to filter products
 * @returns {Promise<Object>} Processing results
 */
export async function reprocessAllProducts(businessId = null) {
  const jobId = `reprocess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    // Ensure cutout directory exists
    await ensureCutoutDir();

    // Find all products that need processing
    const where = {
      imageUrl: { not: null },
      deletedAt: null,
      ...(businessId ? { businessId } : {}),
    };

    const products = await prisma.product.findMany({
      where,
      take: 1000, // Limit to prevent memory issues
    });

    if (products.length === 0) {
      return {
        ok: true,
        jobId,
        message: 'No products found to process',
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0,
      };
    }

    logger.info('[SAM3Catalog] Starting reprocess all', {
      jobId,
      productCount: products.length,
      businessId,
    });

    // Broadcast start event
    broadcastSse('admin', 'catalog.reprocess.started', {
      jobId,
      total: products.length,
      startedAt: new Date().toISOString(),
    });

    // Process in batches
    const batchResults = await processBatch(products, jobId);

    // Broadcast completion event
    broadcastSse('admin', 'catalog.reprocess.completed', {
      jobId,
      ...batchResults,
      completedAt: new Date().toISOString(),
    });

    logger.info('[SAM3Catalog] Reprocess all completed', {
      jobId,
      ...batchResults,
    });

    return {
      ok: true,
      jobId,
      ...batchResults,
    };

  } catch (error) {
    logger.error('[SAM3Catalog] Reprocess all failed', {
      jobId,
      error: error.message,
      stack: error.stack,
    });

    // Broadcast error event
    broadcastSse('admin', 'catalog.reprocess.error', {
      jobId,
      error: error.message,
      failedAt: new Date().toISOString(),
    });

    return {
      ok: false,
      jobId,
      error: error.message,
    };
  }
}


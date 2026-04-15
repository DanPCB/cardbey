/**
 * Menu From Photo Service
 * Business service that uses AI engines to process menu photos
 * Calls VisionEngine and TextEngine via abstraction layer
 */

import { getVisionEngine, getTextEngine } from '../../ai/engines/index.js';
import { callTool } from '../runtime/toolExecutor.js';
import { logger } from './logger.js';

/**
 * Process menu photo and create menu
 * 
 * @param {Object} input - Service input
 * @param {string} input.tenantId
 * @param {string} input.storeId
 * @param {string} input.imageUrl
 * @param {string} [input.theme]
 * @param {Object} [ctx] - Execution context
 * @returns {Promise<Object>} MenuFromPhotoResult format
 */
export async function runMenuFromPhoto(input, ctx) {
  const { tenantId, storeId, imageUrl, theme } = input;

  logger.info('[MenuFromPhotoService] Starting', {
    tenantId,
    storeId,
    imageUrl: imageUrl ? 'provided' : 'missing',
  });

  try {
    // 1. Use VisionEngine to analyze image
    const vision = getVisionEngine();
    const visionResult = await vision.analyzeImage({
      imageUrl,
      task: 'menu',
    });

    const ocrText = visionResult.text || '';
    logger.info('[MenuFromPhotoService] Vision analysis complete', {
      textLength: ocrText.length,
      textPreview: ocrText.substring(0, 300), // First 300 chars for debugging
    });

    // 2. Use TextEngine to parse OCR text into structured menu items
    const text = getTextEngine();
    
    const parsePrompt = `You are a menu parser. Extract menu items from this OCR text:

${ocrText}

Return a JSON array of menu items, each with:
- name: string
- description: string (optional)
- price: number (optional)
- currency: string (optional, default "AUD")
- category: string (optional, e.g. "Coffee", "Beverages", "Food")
- options: string[] (optional, e.g. ["Small", "Large"])

Normalize item names (e.g. "FLAT WHITE" → "Flat White").
Group similar items into categories.
Extract prices if visible.

Return ONLY valid JSON array, no markdown.`;

    const parseResult = await text.generateText({
      systemPrompt: 'You are an expert menu parser. Always return valid JSON arrays only.',
      userPrompt: parsePrompt,
      temperature: 0.2,
      maxTokens: 2000,
    });

    let items;
    try {
      items = JSON.parse(parseResult.text);
      if (!Array.isArray(items)) {
        items = [];
      }
    } catch (parseError) {
      logger.warn('[MenuFromPhotoService] Failed to parse menu JSON, using fallback', {
        error: parseError.message,
      });
      items = [];
    }

    logger.info('[MenuFromPhotoService] Menu items extracted', {
      itemCount: items.length,
    });

    // 3. Infer categories for items that don't have one
    const { inferMenuCategoryKey, getCategoryDisplayName, ensureCategoriesForStore } = await import('../../engines/menu/categoryInference.js');
    
    // Ensure categories exist
    let categoryMap = {};
    if (storeId) {
      const { PrismaClient } = await import('@prisma/client');
      const db = new PrismaClient();
      categoryMap = await ensureCategoriesForStore(storeId, { db });
    }
    
    // Infer categories for items missing them
    const itemsWithCategories = items.map((item) => {
      let categoryName = item.category;
      
      if (!categoryName || categoryName === 'Uncategorized' || categoryName === 'uncategorized') {
        const inferred = inferMenuCategoryKey({
          name: item.name,
          description: item.description || '',
        });
        
        // Use inferred category if confidence is reasonable (> 0.3)
        if (inferred.confidence > 0.3) {
          categoryName = getCategoryDisplayName(inferred.key);
        } else {
          categoryName = null; // Uncategorized
        }
      }
      
      return {
        name: item.name,
        category: categoryName,
        price: item.price ?? 0,
        currency: item.currency || 'AUD',
        description: item.description || null,
      };
    });

    // 4. Extract categories from items
    const categories = [...new Set(itemsWithCategories.map((item) => item.category).filter(Boolean))];

    // 5. Configure menu using engine tool
    const configured = await callTool(
      'menu.configure',
      {
        tenantId,
        storeId,
        items: itemsWithCategories,
        categories,
      },
      ctx
    );

    if (!configured.ok || !configured.data) {
      throw new Error(configured.error || 'Failed to configure menu');
    }

    logger.info('[MenuFromPhotoService] Menu configured');

    // 5. Build standardized result
    const result = {
      version: 'v1',
      type: 'menu',
      confidence: 0.9,
      payload: {
        items: items.map((item) => ({
          name: item.name,
          description: item.description,
          price: item.price,
          currency: item.currency || 'AUD',
          category: item.category,
          options: item.options,
        })),
      },
      raw: {
        vision: visionResult.raw,
        text: parseResult.raw,
        menuConfig: configured.data,
      },
    };

    logger.info('[MenuFromPhotoService] Complete', {
      itemCount: items.length,
      categoryCount: categories.length,
    });

    return result;
  } catch (error) {
    logger.error('[MenuFromPhotoService] Error', {
      error: error.message,
      stack: error.stack,
      input: { tenantId, storeId, imageUrl: imageUrl ? 'provided' : 'missing' },
    });

    throw error;
  }
}


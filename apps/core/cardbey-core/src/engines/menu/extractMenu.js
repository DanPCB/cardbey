/**
 * Extract Menu Tool
 * Extract menu items from image using OCR/vision
 */

import { PrismaClient } from '@prisma/client';
import { getEventEmitter, MENU_EVENTS } from './events.js';
import { configureMenu } from './configureMenu.js';
import { parseMenuWithLLM } from '../../modules/menu/llmMenuParser.js';
import { analyseVisionInput } from '../../modules/vision/universalVisionInput.js';

const prisma = new PrismaClient();

/**
 * Guess category from item name
 * Simple heuristic-based categorization
 */
function guessCategory(name) {
  if (!name) return null;
  
  const lowerName = name.toLowerCase();
  
  // Coffee items
  const coffeeKeywords = ['latte', 'capp', 'mocha', 'espresso', 'macchi', 'flat white', 'long black', 'piccolo', 'batch brew', 'americano', 'cortado'];
  if (coffeeKeywords.some(keyword => lowerName.includes(keyword))) {
    return 'Coffee';
  }
  
  // Beverages
  const beverageKeywords = ['tea', 'chai', 'chocolate', 'brew', 'juice', 'soda', 'lemonade'];
  if (beverageKeywords.some(keyword => lowerName.includes(keyword))) {
    return 'Beverages';
  }
  
  // No match - will be uncategorized
  return null;
}

/**
 * Simple mock vision service for dev/testing
 */
class MockVisionService {
  async parseMenu(imageUrl) {
    // Mock extraction - return sample coffee menu items
    console.log('[Menu Engine] Mock vision parsing for:', imageUrl);
    
    const rawItems = [
      { name: 'Flat White', price: 5.0 },
      { name: 'Latte', price: 5.5 },
      { name: 'Cappuccino', price: 5.5 },
      { name: 'Mocha', price: 6.0 },
      { name: 'Macchiato', price: 5.0 },
      { name: 'Long Black', price: 4.5 },
      { name: 'Hot Chocolate', price: 5.5 },
      { name: 'Tea', price: 4.0 },
      { name: 'Chai Latte', price: 5.5 },
      { name: 'Batch Brew', price: 4.0 },
      { name: 'Piccolo Latte', price: 5.0 },
      { name: 'Espresso', price: 3.5 },
    ];
    
    // Apply category guessing to each item
    const structured = rawItems.map((item) => {
      const categoryName = guessCategory(item.name);
      return {
        name: item.name,
        category: categoryName,
        categoryName: categoryName, // Include both for compatibility
        price: item.price,
        currency: 'AUD',
        description: null,
      };
    });
    
    return {
      rawLines: rawItems.map(item => `${item.name} - $${item.price.toFixed(2)}`),
      structured,
    };
  }
}


/**
 * Mock parse menu (fallback)
 */
async function mockParseMenu(imageUrl) {
  const visionService = new MockVisionService();
  const parsed = await visionService.parseMenu(imageUrl);
  return {
    items: parsed.structured.map((item) => ({
      name: item.name,
      category: item.category,
      price: item.price,
      currency: item.currency || 'AUD',
      description: item.description,
      tags: [],
    })),
    categories: Array.from(new Set(parsed.structured.map((i) => i.category).filter(Boolean))),
  };
}

/**
 * Extract menu from image
 * LLM-first approach: tries LLM parser, falls back to mock parser
 * Automatically saves parsed items to the database via menu.configure
 */
export const extractMenu = async (input, ctx) => {
  const { tenantId, storeId, imageUrl, ocrText, detectedItems, locale } = input;

  const events = ctx?.services?.events || getEventEmitter();
  const db = ctx?.services?.db || prisma;

  console.log('[Menu Engine] Running LLM parser for menu', {
    tenantId,
    storeId,
    imageUrl: imageUrl ? 'provided' : 'missing',
    hasOcrText: !!ocrText,
    detectedItemsCount: detectedItems?.length || 0,
  });

  let llmResult;

  try {
    // Use Universal Vision Input to get structured vision analysis
    const visionResult = await analyseVisionInput({
      tenantId,
      storeId,
      imageUrl,
      purpose: 'menu',
      locale: locale || 'en',
      uiHints: {
        labels: detectedItems || [],
      },
    });

    const menuHints = visionResult.menuHints ?? { items: [] };
    const finalOcrText = visionResult.raw?.ocrText || ocrText || '';

    console.log('[Menu Engine] Vision analysis complete', {
      blockCount: visionResult.blocks.length,
      menuItemCount: menuHints.items?.length ?? 0,
      sectionCount: menuHints.sections?.length ?? 0,
      ocrTextLength: finalOcrText.length,
      ocrTextPreview: finalOcrText.substring(0, 200), // First 200 chars for debugging
    });

    // Try LLM parser with OCR text from vision analysis
    llmResult = await parseMenuWithLLM({
      tenantId,
      storeId,
      ocrText: finalOcrText,
      detectedItems: menuHints.items?.map((item) => item.label) || detectedItems || [],
      locale: locale || 'en',
    });

    console.log('[Menu Engine] LLM menu parse result', {
      tenantId,
      storeId,
      itemCount: llmResult.items.length,
      categoryCount: llmResult.categories?.length ?? 0,
    });
  } catch (err) {
    console.error('[Menu Engine] Vision/LLM pipeline failed, falling back to legacy mock parser', err);
    // Fall back to mock parser
    llmResult = await mockParseMenu(imageUrl);
  }

  // Import category inference helpers
  const { ensureCategoriesForStore, inferMenuCategoryKey, getCategoryDisplayName } = await import('./categoryInference.js');
  
  // Ensure categories exist for store and get category map
  let categoryMap = {};
  if (storeId) {
    categoryMap = await ensureCategoriesForStore(storeId, { db });
  }

  // Convert LLM items into menu.configure input with category inference
  const configureInput = {
    tenantId,
    storeId,
    items: llmResult.items.map((item, index) => {
      // Infer category if not already set by LLM
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
        category: categoryName, // Category name (e.g., "Coffee", "Beverages") or null
        price: item.price ?? 0,
        currency: item.currency ?? 'AUD',
        description: item.description ?? null,
        orderIndex: index,
        tags: item.tags ?? [],
      };
    }),
    categories: llmResult.categories ?? [],
  };

  // If storeId is provided, automatically save parsed items to database via menu.configure
  if (storeId && configureInput.items.length > 0) {
    try {
      // Grid crop images if feature is enabled
      const gridCropEnabled = process.env.FEATURE_MENU_GRID_CROP_IMAGES === 'true' || 
                              process.env.FEATURE_MENU_GRID_CROP_IMAGES === '1';
      
      let cropImageUrls = [];
      
      if (gridCropEnabled && imageUrl) {
        try {
          const { gridCropMenuImages } = await import('../../menu/imageExtractors/gridCropExtractor.js');
          const { uploadCropImage } = await import('../../menu/imageExtractors/uploadCrop.js');
          
          // Get grid dimensions from env or use defaults
          const cols = parseInt(process.env.MENU_GRID_COLS || '4', 10);
          const rows = parseInt(process.env.MENU_GRID_ROWS || '3', 10);
          const photoRatio = parseFloat(process.env.MENU_GRID_PHOTO_RATIO || '0.62');
          const padPx = parseInt(process.env.MENU_GRID_PAD_PX || '6', 10);
          
          console.log('[Menu Engine] Grid cropping enabled, extracting images...', {
            cols,
            rows,
            photoRatio,
            padPx,
            itemCount: configureInput.items.length,
          });
          
          // Crop images
          const cropResult = await gridCropMenuImages({
            imageUrl,
            cols,
            rows,
            photoRatio,
            padPx,
            removeOverlay: true,
          });
          
          if (cropResult.ok && cropResult.crops.length > 0) {
            // Generate extraction ID for naming
            const { randomUUID } = await import('crypto');
            const extractionId = randomUUID().substring(0, 8);
            
            // Upload each crop
            const uploadPromises = cropResult.crops.map((crop, idx) =>
              uploadCropImage({
                buffer: crop.buffer,
                filename: `menu-crop-${storeId}-${extractionId}-${crop.index}.jpg`,
                storeId,
                extractionId,
                index: crop.index,
              }).catch((err) => {
                console.error(`[Menu Engine] Failed to upload crop ${crop.index}:`, err.message);
                return null; // Continue with other crops
              })
            );
            
            const uploadedCrops = await Promise.all(uploadPromises);
            cropImageUrls = uploadedCrops
              .filter((crop) => crop !== null)
              .map((crop) => crop.url);
            
            console.log('[Menu Engine] Grid cropping complete', {
              cropsGenerated: cropResult.crops.length,
              cropsUploaded: cropImageUrls.length,
              itemsToUpdate: configureInput.items.length,
            });
            
            // Map crop URLs to items (row-major order: index 0..n-1)
            const minCount = Math.min(cropImageUrls.length, configureInput.items.length);
            for (let i = 0; i < minCount; i++) {
              if (cropImageUrls[i]) {
                configureInput.items[i].imageUrl = cropImageUrls[i];
              }
            }
            
            if (cropImageUrls.length !== configureInput.items.length) {
              console.warn('[Menu Engine] Crop count mismatch', {
                crops: cropImageUrls.length,
                items: configureInput.items.length,
              });
            }
          }
        } catch (cropError) {
          // Don't fail extraction if cropping fails
          console.error('[Menu Engine] Grid cropping failed (non-fatal):', cropError.message);
        }
      }
      
      // Call menu.configure to save items (with imageUrl if available)
      const configureResult = await configureMenu(configureInput, {
        services: {
          db,
          events,
        },
      });

      // Emit menu.menu_configured event
      await events.emit(MENU_EVENTS.MENU_CONFIGURED, {
        tenantId,
        storeId,
        itemCount: configureInput.items.length,
        categoryCount: configureInput.categories.length,
      });

      console.log('[Menu Engine] Menu configured successfully', {
        tenantId,
        storeId,
        itemCount: configureInput.items.length,
        categoryCount: configureInput.categories.length,
        imagesAttached: cropImageUrls.length,
      });
    } catch (saveError) {
      // Log error but don't fail the extraction - items are still returned to frontend
      console.error('[Menu Engine] Failed to configure menu:', saveError);
      // Continue to return parsed items even if save failed
    }
  } else {
    // Emit menu.menu_extracted event (extraction only, no save)
    await events.emit(MENU_EVENTS.MENU_EXTRACTED, {
      tenantId,
      storeId,
      imageUrl,
      itemCount: configureInput.items.length,
    });
  }

  return {
    ok: true,
    data: {
      itemsConfigured: storeId ? configureInput.items.length : 0,
      categories: configureInput.categories,
      items: configureInput.items.map((item) => ({
        name: item.name,
        category: item.category,
        price: item.price,
        currency: item.currency,
        description: item.description,
        tags: item.tags,
        imageUrl: item.imageUrl || null, // Include imageUrl if available
      })),
    },
  };
};


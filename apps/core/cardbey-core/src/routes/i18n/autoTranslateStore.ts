/**
 * Auto-Translate Store Route
 * 
 * POST /api/stores/:storeId/translate
 * 
 * Triggers AI-powered translation of store and menu items to target language.
 * 
 * TODO: Consider moving this into the Orchestrator job queue for async processing
 * TODO: Support more languages beyond EN/VI (currently hardcoded to these two)
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.js';
import { translateBatch } from '../../services/i18n/aiTranslationService.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * Helper function to set translated fields for Product model
 * Returns an object mapping only to real columns: name, description, and category
 * Falls back to existing values if a translated field is missing
 * 
 * @param product - The original product object
 * @param targetLang - Target language ('en' | 'vi')
 * @param translated - Translated object with optional name, description, category
 * @returns Object with name, description, category fields ready for Prisma update
 */
function setTranslatedFields(
  product: { name: string; description: string | null; category: string | null },
  targetLang: 'en' | 'vi',
  translated: { name?: string; description?: string; category?: string }
): { name: string; description?: string | null; category?: string | null } {
  return {
    name: translated.name ?? product.name,
    description: translated.description !== undefined ? (translated.description || null) : product.description,
    category: translated.category !== undefined ? (translated.category || null) : product.category,
  };
}

/**
 * POST /api/stores/:storeId/translate
 * 
 * Translate store and all its products to target language
 * 
 * Headers:
 *   - Authorization: Bearer <token> (required)
 * 
 * Request body:
 *   - targetLang: 'en' | 'vi' (required)
 * 
 * Response (200):
 *   {
 *     "ok": true,
 *     "targetLang": "vi",
 *     "counts": { "stores": 1, "products": 24 },
 *     "skipped": 0
 *   }
 * 
 * Errors:
 *   - 400: Invalid targetLang or missing store
 *   - 401: Not authenticated
 *   - 403: User doesn't own this store
 *   - 500: Translation service error
 */
router.post('/stores/:storeId/translate', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { targetLang } = req.body;

    // Validate targetLang
    if (!targetLang || (targetLang !== 'en' && targetLang !== 'vi')) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_target_lang',
        message: 'targetLang must be "en" or "vi"',
      });
    }

    // Load store with products
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      include: {
        products: {
          where: { deletedAt: null }, // Only non-deleted products
        },
      },
    });

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'store_not_found',
        message: 'Store not found',
      });
    }

    // Verify user owns this store
    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'You do not have permission to translate this store',
      });
    }

    // Build translation items array
    const translationItems: Array<{
      id: string;
      type: 'store' | 'category' | 'product';
      fields: Record<string, string>;
    }> = [];

    // Add store fields
    const storeFields: Record<string, string> = {};
    if (store.name) storeFields.name = store.name;
    if (store.description) storeFields.description = store.description;
    
    if (Object.keys(storeFields).length > 0) {
      translationItems.push({
        id: store.id,
        type: 'store',
        fields: storeFields,
      });
    }

    // Add product fields
    for (const product of store.products) {
      const productFields: Record<string, string> = {};
      if (product.name) productFields.name = product.name;
      if (product.description) productFields.description = product.description;
      if (product.category) productFields.category = product.category;

      if (Object.keys(productFields).length > 0) {
        translationItems.push({
          id: product.id,
          type: 'product',
          fields: productFields,
        });
      }
    }

    if (translationItems.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'no_content_to_translate',
        message: 'Store has no translatable content (name, description, etc.)',
      });
    }

    console.log(`[Auto Translate] Translating ${translationItems.length} items for store ${storeId} to ${targetLang}`);

    // Call translation service
    let translationResults;
    try {
      translationResults = await translateBatch(translationItems, targetLang);
    } catch (error: any) {
      console.error('[Auto Translate] Translation service error:', error);
      return res.status(500).json({
        ok: false,
        error: 'translation_failed',
        message: `Translation failed: ${error.message}`,
      });
    }

    // Update store and products with translations
    let storeUpdated = false;
    let productsUpdated = 0;
    let skipped = 0;

    for (const result of translationResults) {
      try {
        if (result.type === 'store') {
          // Update store with translated fields
          const updateData: { name?: string; description?: string } = {};
          if (result.translated.name) updateData.name = result.translated.name;
          if (result.translated.description !== undefined) {
            updateData.description = result.translated.description || null;
          }
          
          await prisma.business.update({
            where: { id: result.id },
            data: updateData,
          });
          storeUpdated = true;
        } else if (result.type === 'product') {
          // Find the product to get current field values
          const product = store.products.find(p => p.id === result.id);
          if (product) {
            const updateData = setTranslatedFields(product, targetLang, result.translated);
            await prisma.product.update({
              where: { id: result.id },
              data: updateData,
            });
            productsUpdated++;
          } else {
            console.warn(`[Auto Translate] Product ${result.id} not found in store`);
            skipped++;
          }
        }
      } catch (error: any) {
        console.error(`[Auto Translate] Failed to update ${result.type} ${result.id}:`, error);
        skipped++;
      }
    }

    // Count skipped items (items that weren't in translation results)
    const translatedIds = new Set(translationResults.map(r => r.id));
    skipped += translationItems.filter(item => !translatedIds.has(item.id)).length;

    console.log(`[Auto Translate] Completed: store=${storeUpdated ? 1 : 0}, products=${productsUpdated}, skipped=${skipped}`);

    res.json({
      ok: true,
      targetLang,
      counts: {
        stores: storeUpdated ? 1 : 0,
        products: productsUpdated,
      },
      skipped,
    });
  } catch (error: any) {
    console.error('[Auto Translate] Error:', error);
    next(error);
  }
});

export default router;


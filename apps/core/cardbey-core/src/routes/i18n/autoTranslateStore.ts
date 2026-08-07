/**
 * Auto-Translate Store Route
 *
 * POST /api/stores/:storeId/translate
 *
 * AI-powered translation of store + products into the translations JSON layer.
 * NEVER overwrites canonical name/description/category fields.
 *
 * Persistence path:
 *   Canonical Product → TranslationEngine → TranslationRecord → translations[lang]
 */

import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import {
  translateCatalogBatch,
  wouldOverwriteCanonical,
  isLanguageCode,
  detectLegacyMessageLocale,
  setTranslationProvider,
  createOpenAiTranslationProvider,
  ensureDefaultTranslationProvider,
} from '../../lib/languageIntelligence/index.js';

const router = express.Router();

function inferSourceLanguage(texts: string[]): string {
  const joined = texts.filter(Boolean).join(' ');
  return detectLegacyMessageLocale(joined);
}

/**
 * POST /api/stores/:storeId/translate
 *
 * Body: { targetLang: string }  — Language Intelligence language code (e.g. en, vi, ja)
 *
 * Response:
 *   {
 *     ok: true,
 *     targetLang,
 *     mode: "translations_layer",
 *     canonicalPreserved: true,
 *     counts: { stores, products },
 *     skipped,
 *     summary: { productsUpdated }  // dashboard toast compat
 *   }
 */
router.post('/stores/:storeId/translate', requireAuth, async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { targetLang } = req.body;

    if (!targetLang || !isLanguageCode(targetLang)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_target_lang',
        message: 'targetLang must be a supported Language Intelligence code (e.g. en, vi, ja)',
      });
    }

    const store = await prisma.business.findUnique({
      where: { id: storeId },
      include: {
        products: {
          where: { deletedAt: null },
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

    if (store.userId !== req.userId) {
      return res.status(403).json({
        ok: false,
        error: 'access_denied',
        message: 'You do not have permission to translate this store',
      });
    }

    const sampleTexts: string[] = [];
    if (store.name) sampleTexts.push(store.name);
    if (store.description) sampleTexts.push(store.description);
    for (const p of store.products.slice(0, 20)) {
      if (p.name) sampleTexts.push(p.name);
    }
    const sourceLanguage = inferSourceLanguage(sampleTexts);

    /** @type {Array<{ id: string, type: string, model: object, fields: Record<string, string>, sourceLanguage: string, revision: string|number, contentClass: string }>} */
    const items: Array<{
      id: string;
      type: string;
      model: object;
      fields: Record<string, string>;
      sourceLanguage: string;
      revision: string | number;
      contentClass: string;
    }> = [];

    const storeFields: Record<string, string> = {};
    if (store.name) storeFields.name = store.name;
    if (store.description) storeFields.description = store.description;
    if (Object.keys(storeFields).length > 0) {
      items.push({
        id: store.id,
        type: 'store',
        model: store,
        fields: storeFields,
        sourceLanguage,
        revision: store.updatedAt?.toISOString?.() ?? String(store.updatedAt ?? 0),
        contentClass: 'product',
      });
    }

    for (const product of store.products) {
      const productFields: Record<string, string> = {};
      if (product.name) productFields.name = product.name;
      if (product.description) productFields.description = product.description;
      if (product.category) productFields.category = product.category;
      if (Object.keys(productFields).length === 0) continue;
      items.push({
        id: product.id,
        type: 'product',
        model: product,
        fields: productFields,
        sourceLanguage,
        revision: product.updatedAt?.toISOString?.() ?? String(product.updatedAt ?? 0),
        contentClass: 'product',
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'no_content_to_translate',
        message: 'Store has no translatable content (name, description, etc.)',
      });
    }

    console.log(
      `[Auto Translate] Engine translating ${items.length} items for store ${storeId} → ${targetLang} (source=${sourceLanguage})`,
    );

    // Prefer OpenAI when configured; engine falls back to stub only in test.
    try {
      if (process.env.OPENAI_API_KEY) {
        setTranslationProvider(createOpenAiTranslationProvider());
      } else {
        ensureDefaultTranslationProvider();
      }
    } catch {
      ensureDefaultTranslationProvider();
    }

    let batchResult;
    try {
      batchResult = await translateCatalogBatch({
        items,
        targetLanguage: targetLang,
        forceRefresh: Boolean(req.body?.forceRefresh),
      });
    } catch (error: any) {
      console.error('[Auto Translate] Translation engine error:', error);
      return res.status(500).json({
        ok: false,
        error: 'translation_failed',
        message: `Translation failed: ${error.message}`,
      });
    }

    let storeUpdated = false;
    let productsUpdated = 0;
    let skipped = 0;

    for (const result of batchResult.results) {
      try {
        if (wouldOverwriteCanonical(result.patch)) {
          console.error('[Auto Translate] Refused canonical overwrite patch', result.id);
          skipped++;
          continue;
        }

        if (result.type === 'store') {
          await prisma.business.update({
            where: { id: result.id },
            data: result.patch,
          });
          storeUpdated = true;
        } else if (result.type === 'product') {
          await prisma.product.update({
            where: { id: result.id },
            data: result.patch,
          });
          productsUpdated++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        console.error(`[Auto Translate] Failed to update ${result.type} ${result.id}:`, error);
        skipped++;
      }
    }

    console.log(
      `[Auto Translate] Completed (translations_layer): store=${storeUpdated ? 1 : 0}, products=${productsUpdated}, skipped=${skipped}`,
    );

    res.json({
      ok: true,
      targetLang,
      mode: 'translations_layer',
      canonicalPreserved: true,
      sourceLanguage,
      counts: {
        stores: storeUpdated ? 1 : 0,
        products: productsUpdated,
      },
      // Dashboard StoreTranslationsSection historically read summary.productsUpdated
      summary: {
        storesUpdated: storeUpdated ? 1 : 0,
        productsUpdated,
      },
      skipped,
    });
  } catch (error: any) {
    console.error('[Auto Translate] Error:', error);
    next(error);
  }
});

export default router;

/**
 * Opt-in Language Intelligence localize APIs (Phase 3).
 *
 * POST /api/language-intelligence/localize-conversation
 * POST /api/language-intelligence/localize-storefront
 *
 * Never mutates canonical stored content. Auth required.
 */

import express from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import {
  isLanguageIntelligenceConversationV1Enabled,
  isLanguageIntelligenceStorefrontLocalizerV1Enabled,
  localizeConversation,
  attachConversationLocalization,
  localizeStorefrontView,
  applyStorefrontLocalizeShadow,
  setTranslationProvider,
  createOpenAiTranslationProvider,
  ensureDefaultTranslationProvider,
  createStubTranslationProvider,
} from '../../lib/languageIntelligence/index.js';

const router = express.Router();

function ensureProvider() {
  try {
    if (process.env.OPENAI_API_KEY) {
      setTranslationProvider(createOpenAiTranslationProvider());
    } else if (process.env.NODE_ENV === 'test') {
      setTranslationProvider(createStubTranslationProvider());
    } else {
      ensureDefaultTranslationProvider();
    }
  } catch {
    ensureDefaultTranslationProvider();
  }
}

/**
 * Body: {
 *   messages: Array<{ id, content|text }>,
 *   targetLanguage?: string,
 *   autoTranslateConversation?: boolean,
 *   mode?: 'original'|'translated'|'both',
 *   attach?: boolean
 * }
 */
router.post('/language-intelligence/localize-conversation', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligenceConversationV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'conversation_localizer_disabled',
        message: 'ENABLE_LANGUAGE_INTELLIGENCE_CONVERSATION_V1 is off',
      });
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages_required' });
    }

    ensureProvider();

    const localized = await localizeConversation({
      messages,
      targetLanguage: req.body?.targetLanguage,
      autoTranslateConversation: req.body?.autoTranslateConversation !== false,
      mode: req.body?.mode || 'translated',
      languageHints: {
        explicitLanguage: req.body?.targetLanguage,
        browserLanguage: req.headers['accept-language'],
      },
      force: true,
      maxMessages: req.body?.maxMessages,
    });

    const payload = {
      ok: true,
      ...localized,
    };

    if (req.body?.attach) {
      payload.messages = attachConversationLocalization(messages, localized);
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * Body: {
 *   storeId: string,
 *   targetLanguage?: string,
 *   mode?: 'original'|'translated'|'both',
 *   generateIfMissing?: boolean,
 *   includeProducts?: boolean,
 *   persistGenerated?: boolean  // writes translations layer only when generateIfMissing
 * }
 */
router.post('/language-intelligence/localize-storefront', requireAuth, async (req, res, next) => {
  try {
    if (!isLanguageIntelligenceStorefrontLocalizerV1Enabled()) {
      return res.status(503).json({
        ok: false,
        error: 'storefront_localizer_disabled',
        message: 'ENABLE_LANGUAGE_INTELLIGENCE_STOREFRONT_LOCALIZER_V1 is off',
      });
    }

    const storeId = String(req.body?.storeId || '').trim();
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'store_id_required' });
    }

    const includeProducts = req.body?.includeProducts !== false;
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      ...(includeProducts
        ? { include: { products: { where: { deletedAt: null }, take: 100 } } }
        : {}),
    });

    if (!store) {
      return res.status(404).json({ ok: false, error: 'store_not_found' });
    }
    if (store.userId !== req.userId) {
      return res.status(403).json({ ok: false, error: 'access_denied' });
    }

    ensureProvider();

    const localized = await localizeStorefrontView({
      store,
      products: includeProducts ? store.products || [] : [],
      targetLanguage: req.body?.targetLanguage,
      mode: req.body?.mode || 'translated',
      generateIfMissing: Boolean(req.body?.generateIfMissing),
      force: true,
    });

    // Optional persist of generated translations layer (never canonical)
    if (req.body?.persistGenerated && req.body?.generateIfMissing) {
      if (localized.store?.translationsPatch?.translations) {
        await prisma.business.update({
          where: { id: storeId },
          data: localized.store.translationsPatch,
        });
      }
      for (const p of localized.products || []) {
        if (p.productId && p.translationsPatch?.translations) {
          await prisma.product.update({
            where: { id: p.productId },
            data: p.translationsPatch,
          });
        }
      }
    }

    const shadow = applyStorefrontLocalizeShadow(
      { id: store.id, name: store.name, meta: {} },
      localized,
    );

    res.json({
      ok: true,
      ...localized,
      shadowAttached: shadow.attached,
      shadowMeta: shadow.dto?.meta?.languageIntelligence ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

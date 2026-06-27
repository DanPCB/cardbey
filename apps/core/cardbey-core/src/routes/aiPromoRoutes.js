/**
 * AI Promo Routes — Content Studio promotion graphic APIs.
 * POST /api/ai/image/resolve, /copy/generate, /layout/generate, /image/generate
 */

import express from 'express';
import { z } from 'zod';
import { optionalAuth } from '../middleware/auth.js';
import { getTenantId } from '../lib/missionAccess.js';
import {
  resolvePromoImage,
  generatePromoCopy,
  generatePromoLayout,
  generateElementImages,
  createPromotionGraphic,
} from '../services/promotionGraphic/promotionGraphicService.js';
import { dispatchTool } from '../lib/toolDispatcher.js';

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

const ResolveSchema = z.object({
  intent: z.string().min(1).max(2000),
  mood: z.string().optional(),
  format: z.enum(['9:16', '16:9', 'square']).optional(),
  content: z.record(z.any()).optional().default({}),
  policy: z
    .object({
      prefer: z.enum(['stock-first', 'ai-first']).optional(),
      allowAi: z.boolean().optional(),
    })
    .optional(),
});

const CopySchema = z.object({
  intent: z.string().max(2000).optional(),
  mood: z.string().optional(),
  content: z.record(z.any()).optional().default({}),
  storeId: z.string().optional(),
  description: z.string().optional(),
}).refine((data) => Boolean(String(data.intent ?? data.description ?? '').trim()), {
  message: 'intent or description is required',
});

const LayoutSchema = z.object({
  intent: z.string().min(1).max(2000),
  content: z.record(z.any()).optional().default({}),
  format: z.string().optional(),
  mood: z.string().optional(),
  copy: z.record(z.any()).optional(),
  imageUrl: z.string().optional(),
  brandColors: z.record(z.any()).optional(),
});

const GenerateImageSchema = z.object({
  prompt: z.string().min(1).max(1000),
  style: z.enum(['photo', 'illustration', 'flat', 'poster']).optional().default('photo'),
  aspectRatio: z.enum(['square', 'landscape', 'portrait']).optional().default('landscape'),
  context: z.record(z.any()).optional(),
});

const PromotionGraphicSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  prompt: z.string().min(1).max(2000).optional(),
  storeId: z.string().min(1),
  format: z.string().optional(),
  style: z.string().optional(),
  mood: z.string().optional(),
});

const ActivatePromotionSchema = z.object({
  promotionId: z.string().min(1),
});

const SharePromotionSchema = z.object({
  promotionId: z.string().min(1),
  storeId: z.string().min(1),
  graphicUrl: z.string().optional(),
  headline: z.string().optional(),
  platforms: z.array(z.string()).optional(),
});

router.post('/promotion-graphic/generate', optionalAuth, async (req, res) => {
  try {
    const parsed = PromotionGraphicSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const description = parsed.data.description || parsed.data.prompt || '';
    const userId = req.user?.id || req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED', message: 'Authentication required' });
    }
    const tenantKey = getTenantId(req.user) || parsed.data.storeId || 'default';
    const result = await createPromotionGraphic({
      description,
      storeId: parsed.data.storeId,
      userId,
      format: parsed.data.format,
      style: parsed.data.style,
      mood: parsed.data.mood,
      tenantKey,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[AI Promo] promotion-graphic/generate failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'PROMOTION_GRAPHIC_FAILED',
      message: err?.message ?? 'Promotion graphic generation failed',
    });
  }
});

router.post('/image/resolve', optionalAuth, async (req, res) => {
  try {
    const parsed = ResolveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const result = await resolvePromoImage(parsed.data);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('[AI Promo] image/resolve failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'IMAGE_RESOLVE_FAILED',
      message: err?.message ?? 'Image resolution failed',
    });
  }
});

router.post('/copy/generate', optionalAuth, async (req, res) => {
  try {
    const parsed = CopySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const tenantKey = getTenantId(req.user) || parsed.data.storeId || 'default';
    const intent = parsed.data.intent || parsed.data.description || '';
    const copyRaw = await generatePromoCopy({
      intent,
      mood: parsed.data.mood,
      content: parsed.data.content,
      storeId: parsed.data.storeId,
      tenantKey,
    });
    return res.json({
      ok: true,
      copy: {
        headline: copyRaw.headline,
        subheadline: copyRaw.subheadline,
        cta: copyRaw.ctaText || copyRaw.cta || 'Shop now',
      },
    });
  } catch (err) {
    console.error('[AI Promo] copy/generate failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'COPY_GENERATION_FAILED',
      message: err?.message ?? 'Copy generation failed',
    });
  }
});

router.post('/layout/generate', optionalAuth, async (req, res) => {
  try {
    const parsed = LayoutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const content = {
      ...parsed.data.content,
      ...(parsed.data.copy ?? {}),
    };
    const layout = generatePromoLayout({
      intent: parsed.data.intent,
      content,
      format: parsed.data.format,
      mood: parsed.data.mood,
    });
    return res.json({ ok: true, layout });
  } catch (err) {
    console.error('[AI Promo] layout/generate failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'LAYOUT_GENERATION_FAILED',
      message: err?.message ?? 'Layout generation failed',
    });
  }
});

router.post('/promotion-graphic/activate', optionalAuth, async (req, res) => {
  try {
    const parsed = ActivatePromotionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const userId = req.user?.id || req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED', message: 'Authentication required' });
    }
    const result = await dispatchTool(
      'activate_promotion',
      { promotionId: parsed.data.promotionId },
      { userId, actorId: userId },
    );
    if (result?.status !== 'ok') {
      return res.status(500).json({
        ok: false,
        error: result?.error?.code ?? 'ACTIVATE_FAILED',
        message: result?.error?.message ?? 'Failed to activate promotion',
      });
    }
    const out = result.output && typeof result.output === 'object' ? result.output : {};
    return res.json({
      ok: true,
      promotion: {
        id: out.promotionId ?? parsed.data.promotionId,
        status: out.status ?? 'active',
        title: out.title ?? null,
      },
      message: 'Promotion is now active on your store.',
    });
  } catch (err) {
    console.error('[AI Promo] promotion-graphic/activate failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'ACTIVATE_FAILED',
      message: err?.message ?? 'Promotion activation failed',
    });
  }
});

router.post('/promotion-graphic/share', optionalAuth, async (req, res) => {
  try {
    const parsed = SharePromotionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const userId = req.user?.id || req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED', message: 'Authentication required' });
    }
    const { promotionId, storeId, graphicUrl, headline, platforms } = parsed.data;
    const result = await dispatchTool(
      'publish_to_social',
      {
        promotionId,
        storeId,
        platforms: platforms?.length ? platforms : ['facebook', 'whatsapp'],
        campaignUrl: graphicUrl,
        caption: headline,
        postMode: 'share_link',
      },
      { userId, actorId: userId, storeId },
    );
    if (result?.status !== 'ok') {
      return res.status(500).json({
        ok: false,
        error: result?.error?.code ?? 'SHARE_FAILED',
        message: result?.error?.message ?? 'Failed to share promotion',
      });
    }
    const out = result.output && typeof result.output === 'object' ? result.output : {};
    const platformRows = Array.isArray(out.platforms) ? out.platforms : [];
    return res.json({
      ok: true,
      platforms: platformRows,
      message:
        typeof out.message === 'string' && out.message.trim()
          ? out.message.trim()
          : 'Share links are ready.',
      phase: out.phase ?? 'share_links',
    });
  } catch (err) {
    console.error('[AI Promo] promotion-graphic/share failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'SHARE_FAILED',
      message: err?.message ?? 'Social share failed',
    });
  }
});

router.post('/image/generate', optionalAuth, async (req, res) => {
  try {
    const parsed = GenerateImageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'validation_failed', message: parsed.error.flatten() });
    }
    const image = await generateElementImages(parsed.data);
    return res.json({
      ok: true,
      images: [image],
    });
  } catch (err) {
    console.error('[AI Promo] image/generate failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'IMAGE_GENERATION_FAILED',
      message: err?.message ?? 'Image generation failed',
    });
  }
});

export default router;

/**
 * Promo Engine API Routes
 * Exposes promo engine tools as HTTP endpoints
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { getEventEmitter } from '../engines/promo/events.js';
import {
  configurePromo,
  generatePromoAssets,
  queryActivePromos,
  redeemPromo,
} from '../engines/promo/index.js';
import {
  ConfigurePromoInput,
  GeneratePromoAssetsInput,
  QueryActivePromosInput,
  RedeemPromoInput,
} from '../engines/promo/types.js';
import { z } from 'zod';

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
      // TODO: Add QR, images services when available
    },
  };
}

/**
 * POST /api/promo/engine/preview
 * Preview a promo configuration without applying it
 */
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const parsed = ConfigurePromoInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    
    // Preview mode: validate but don't create
    // Return what would be created
    const preview = {
      promoId: `preview-${Date.now()}`,
      name: input.name,
      type: input.type,
      targetType: input.targetType,
      value: input.value,
      startAt: input.startAt,
      endAt: input.endAt,
      usageLimit: input.usageLimit,
    };

    res.json({
      ok: true,
      data: {
        preview,
        message: 'This is a preview. Use /apply to create the promo.',
      },
    });
  } catch (error) {
    console.error('[Promo Engine] Preview error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to preview promo',
    });
  }
});

/**
 * POST /api/promo/engine/apply
 * Create or update a promo configuration
 */
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const parsed = ConfigurePromoInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    // Configure promo
    const result = await configurePromo(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    // Optionally generate assets if requested
    let assets = null;
    if (req.body.triggerQrCreation !== false) {
      try {
        const assetsResult = await generatePromoAssets(
          {
            tenantId: input.tenantId,
            storeId: input.storeId,
            promoId: result.data.promoId,
          },
          ctx
        );
        if (assetsResult.ok) {
          assets = assetsResult.data;
        }
      } catch (err) {
        console.warn('[Promo Engine] Failed to generate assets:', err);
        // Non-critical, continue
      }
    }

    res.json({
      ok: true,
      data: {
        promoId: result.data.promoId,
        assets,
        summary: {
          name: input.name,
          type: input.type,
          value: input.value,
          targetType: input.targetType,
        },
      },
    });
  } catch (error) {
    console.error('[Promo Engine] Apply error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to apply promo',
    });
  }
});

/**
 * GET /api/promo/engine/active
 * Query active promos for a store
 */
router.get('/active', requireAuth, async (req, res) => {
  try {
    const parsed = QueryActivePromosInput.safeParse({
      tenantId: req.query.tenantId || req.user?.tenantId,
      storeId: req.query.storeId,
    });

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await queryActivePromos(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Promo Engine] Query active error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to query active promos',
    });
  }
});

/**
 * POST /api/promo/engine/redeem
 * Redeem a promo
 */
router.post('/redeem', requireAuth, async (req, res) => {
  try {
    const parsed = RedeemPromoInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const ctx = createEngineContext();

    const result = await redeemPromo(input, ctx);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('[Promo Engine] Redeem error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to redeem promo',
    });
  }
});

export default router;


/**
 * Promo From Dashboard Handler
 * Orchestrator handler for promo_from_dashboard entry point
 */

import { callTool } from '../runtime/toolExecutor.js';
import { logger } from '../services/logger.js';
import type { ToolContext } from '../runtime/toolExecutor.js';

/**
 * Promo From Dashboard Handler Input
 */
export interface PromoFromDashboardInput {
  tenantId: string;
  storeId: string;
  promoConfig: {
    name: string;
    type: 'percentage' | 'fixed' | 'bogo' | 'free_item';
    targetType: 'item' | 'category' | 'cart';
    targetId?: string;
    value: number;
    startAt?: string;
    endAt?: string;
    usageLimit?: number;
  };
  triggerQrCreation?: boolean;
}

/**
 * Promo From Dashboard Handler Result
 */
export interface PromoFromDashboardResult {
  ok: boolean;
  summary: {
    promoId?: string;
    name?: string;
    type?: string;
    value?: number;
  };
  ids: {
    promoId?: string;
    qrUrl?: string;
    bannerUrl?: string;
  };
  nextSteps?: string[];
  error?: {
    message: string;
  };
}

/**
 * Handle promo_from_dashboard entry point
 * Creates a promo from dashboard configuration
 * 
 * @param input - Handler input parameters
 * @param ctx - Execution context
 * @returns Handler result
 */
export async function handlePromoFromDashboard(
  input: PromoFromDashboardInput,
  ctx?: ToolContext
): Promise<PromoFromDashboardResult> {
  try {
    logger.info('[PromoFromDashboard] Starting promo from dashboard flow', {
      tenantId: input.tenantId,
      storeId: input.storeId,
      promoName: input.promoConfig.name,
    });

    // Step 1: Configure promo
    logger.info('[PromoFromDashboard] Step 1: Configuring promo');
    const configureRes = await callTool(
      'promo.configure',
      {
        tenantId: input.tenantId,
        storeId: input.storeId,
        promoId: null,
        ...input.promoConfig,
      },
      ctx
    );

    if (!configureRes.ok || !configureRes.data) {
      throw new Error(configureRes.error || 'Failed to configure promo');
    }

    const promoId = (configureRes.data as { promoId: string }).promoId;

    logger.info('[PromoFromDashboard] Promo configured', { promoId });

    // Step 2: Generate assets (if requested)
    let qrUrl: string | undefined;
    let bannerUrl: string | undefined;
    if (input.triggerQrCreation !== false) {
      logger.info('[PromoFromDashboard] Step 2: Generating promo assets');
      const assetsRes = await callTool(
        'promo.generate-assets',
        {
          tenantId: input.tenantId,
          storeId: input.storeId,
          promoId,
        },
        ctx
      );

      if (assetsRes.ok && assetsRes.data) {
        const assetsData = assetsRes.data as {
          qrUrl?: string;
          bannerUrl?: string;
        };
        qrUrl = assetsData.qrUrl;
        bannerUrl = assetsData.bannerUrl;
      } else {
        logger.warn('[PromoFromDashboard] Failed to generate assets', {
          error: assetsRes.error,
        });
        // Non-critical, continue
      }
    }

    const nextSteps: string[] = [];
    if (!qrUrl && input.triggerQrCreation !== false) {
      nextSteps.push('Generate QR code using /api/promo/engine/generate-assets');
    }
    nextSteps.push('Share promo with customers using QR code or banner');
    nextSteps.push('Monitor promo usage via /api/promo/engine/active');

    logger.info('[PromoFromDashboard] Flow completed successfully', {
      promoId,
    });

    return {
      ok: true,
      summary: {
        promoId,
        name: input.promoConfig.name,
        type: input.promoConfig.type,
        value: input.promoConfig.value,
      },
      ids: {
        promoId,
        qrUrl,
        bannerUrl,
      },
      nextSteps,
    };
  } catch (err) {
    logger.error('[PromoFromDashboard] Flow error', {
      error: err instanceof Error ? err.message : String(err),
      input: {
        tenantId: input.tenantId,
        storeId: input.storeId,
      },
    });

    return {
      ok: false,
      summary: {},
      ids: {},
      error: {
        message: err instanceof Error ? err.message : 'Promo from dashboard flow failed',
      },
    };
  }
}




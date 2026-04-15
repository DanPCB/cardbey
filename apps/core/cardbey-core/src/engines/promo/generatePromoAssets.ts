/**
 * Generate Promo Assets Tool
 * Generate QR codes and banners for promotions
 */

import { getEventEmitter, PROMO_EVENTS } from './events.ts';
import type { GeneratePromoAssetsInput, GeneratePromoAssetsOutput } from './types.ts';
import type { EngineContext } from './configurePromo.ts';

/**
 * Generate promo assets
 * Creates QR codes and optionally banner images
 * 
 * @param input - Asset generation parameters
 * @param ctx - Execution context with services
 * @returns Generated asset URLs
 */
export const generatePromoAssets = async (
  input: GeneratePromoAssetsInput,
  ctx?: EngineContext
): Promise<GeneratePromoAssetsOutput> => {
  const { tenantId, storeId, promoId, types = ['qr'] } = input;

  const events = ctx?.services?.events || getEventEmitter();
  const qrService = ctx?.services?.qr as {
    generate?: (params: { url: string }) => Promise<string>;
  } | undefined;
  const imagesService = ctx?.services?.images as {
    generatePromoBanner?: (params: { promoId: string; name?: string; type?: string; value?: number }) => Promise<string>;
  } | undefined;

  const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_API_BASE || 'http://localhost:3000';
  const promoUrl = `${publicBaseUrl}/promo/${storeId}/${promoId}`;

  let qrUrl: string | undefined;
  const bannerUrls: string[] = [];
  const couponUrls: string[] = [];

  // Generate QR code
  if (types.includes('qr')) {
    if (qrService?.generate) {
      qrUrl = await qrService.generate({ url: promoUrl });
    } else {
      // Fallback: Use public QR service
      qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(promoUrl)}`;
    }
  }

  // Generate banner
  if (types.includes('banner')) {
    if (imagesService?.generatePromoBanner) {
      // Get promo details for banner generation
      const { PrismaClient } = await import('@prisma/client');
      const prisma = ctx?.services?.db || new PrismaClient();
      const promo = await prisma.promoRule.findUnique({
        where: { id: promoId },
        select: { name: true, type: true, value: true },
      });

      if (promo) {
        const bannerUrl = await imagesService.generatePromoBanner({
          promoId,
          name: promo.name,
          type: promo.type,
          value: promo.value,
        });
        bannerUrls.push(bannerUrl);
      }
    } else {
      // Fallback: Generic banner URL
      bannerUrls.push(`${publicBaseUrl}/api/promo/banner/${promoId}`);
    }
  }

  // Generate coupon (similar to banner but different format)
  if (types.includes('coupon')) {
    // For now, use banner generation
    if (imagesService?.generatePromoBanner) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = ctx?.services?.db || new PrismaClient();
      const promo = await prisma.promoRule.findUnique({
        where: { id: promoId },
        select: { name: true, type: true, value: true },
      });

      if (promo) {
        const couponUrl = await imagesService.generatePromoBanner({
          promoId,
          name: promo.name,
          type: promo.type,
          value: promo.value,
        });
        couponUrls.push(couponUrl);
      }
    } else {
      couponUrls.push(`${publicBaseUrl}/api/promo/coupon/${promoId}`);
    }
  }

  // Emit event
  await events.emit(PROMO_EVENTS.PROMO_ACTIVATED, {
    tenantId,
    storeId,
    promoId,
  });

  return {
    ok: true,
    data: {
      qrUrl,
      bannerUrls: bannerUrls.length > 0 ? bannerUrls : undefined,
      couponUrls: couponUrls.length > 0 ? couponUrls : undefined,
    },
  };
};

/**
 * Generate Promo Assets Tool
 * Generate QR codes, banners, and coupon cards for promos
 */

import { getEventEmitter, PROMO_EVENTS } from './events.js';

/**
 * Generate promo assets
 * Creates QR codes, banners, and coupon cards
 */
export const generatePromoAssets = async (input, ctx) => {
  const { tenantId, storeId, promoId, types = ['qr', 'banner'] } = input;

  const events = ctx?.services?.events || getEventEmitter();
  const qrService = ctx?.services?.qr;
  const imagesService = ctx?.services?.images;

  const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_API_BASE || 'http://localhost:3000';
  const promoUrl = `${publicBaseUrl}/promo/${storeId}/${promoId}`;

  const result = {
    qrUrl: undefined,
    bannerUrls: [],
    couponUrls: [],
  };

  // Generate QR code if requested
  if (types.includes('qr')) {
    if (qrService) {
      result.qrUrl = await qrService.generate({ url: promoUrl });
    } else {
      // Fallback: Generate QR code URL
      result.qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(promoUrl)}`;
    }
  }

  // Generate banners if requested
  if (types.includes('banner')) {
    if (imagesService) {
      const bannerUrl = await imagesService.generatePromoBanner({ promoId });
      result.bannerUrls = [bannerUrl];
    } else {
      // Fallback: Placeholder banner URL
      result.bannerUrls = [`${publicBaseUrl}/api/promo/banner/${promoId}`];
    }
  }

  // Generate coupon cards if requested
  if (types.includes('coupon')) {
    if (imagesService) {
      const couponUrl = await imagesService.generatePromoCoupon({ promoId });
      result.couponUrls = [couponUrl];
    } else {
      // Fallback: Placeholder coupon URL
      result.couponUrls = [`${publicBaseUrl}/api/promo/coupon/${promoId}`];
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
    data: result,
  };
};




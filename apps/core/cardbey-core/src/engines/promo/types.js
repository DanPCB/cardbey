/**
 * Promo Engine Types
 * Zod schemas for input/output validation
 */

import { z } from 'zod';

/**
 * Configure Promo Input
 */
export const ConfigurePromoInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  promoId: z.string().nullable().optional(),
  name: z.string(),
  type: z.enum(['percentage', 'fixed', 'bogo', 'free_item']),
  targetType: z.enum(['item', 'category', 'cart']),
  targetId: z.string().nullable().optional(),
  value: z.number(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  usageLimit: z.number().nullable().optional(),
});

/**
 * Configure Promo Output
 */
export const ConfigurePromoOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    promoId: z.string(),
  }),
});

/**
 * Generate Promo Assets Input
 */
export const GeneratePromoAssetsInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  promoId: z.string(),
  types: z.array(z.enum(['qr', 'banner', 'coupon'])).optional(),
});

/**
 * Generate Promo Assets Output
 */
export const GeneratePromoAssetsOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    qrUrl: z.string().optional(),
    bannerUrls: z.array(z.string()).optional(),
    couponUrls: z.array(z.string()).optional(),
  }),
});

/**
 * Query Active Promos Input
 */
export const QueryActivePromosInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  targetItemId: z.string().nullable().optional(),
  targetCategoryId: z.string().nullable().optional(),
});

/**
 * Query Active Promos Output
 */
export const QueryActivePromosOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    promos: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        targetType: z.string(),
        targetId: z.string().nullable(),
        value: z.number(),
        startAt: z.string().nullable(),
        endAt: z.string().nullable(),
        usageLimit: z.number().nullable(),
        usageCount: z.number(),
        active: z.boolean(),
      })
    ),
  }),
});

/**
 * Redeem Promo Input
 */
export const RedeemPromoInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  promoId: z.string(),
  customerId: z.string().nullable().optional(),
  deviceId: z.string().nullable().optional(),
});

/**
 * Redeem Promo Output
 */
export const RedeemPromoOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    discountType: z.string(),
    discountValue: z.number(),
    redemptionId: z.string(),
  }),
});




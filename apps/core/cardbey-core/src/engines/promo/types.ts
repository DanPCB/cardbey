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
  active: z.boolean().optional(),
});

export type ConfigurePromoInput = z.infer<typeof ConfigurePromoInput>;

/**
 * Configure Promo Output
 */
export const ConfigurePromoOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    promoId: z.string(),
  }),
});

export type ConfigurePromoOutput = z.infer<typeof ConfigurePromoOutput>;

/**
 * Generate Promo Assets Input
 */
export const GeneratePromoAssetsInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  promoId: z.string(),
  types: z.array(z.enum(['qr', 'banner', 'coupon'])).optional(),
});

export type GeneratePromoAssetsInput = z.infer<typeof GeneratePromoAssetsInput>;

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

export type GeneratePromoAssetsOutput = z.infer<typeof GeneratePromoAssetsOutput>;

/**
 * Query Active Promos Input
 */
export const QueryActivePromosInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  targetItemId: z.string().nullable().optional(),
  targetCategoryId: z.string().nullable().optional(),
});

export type QueryActivePromosInput = z.infer<typeof QueryActivePromosInput>;

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

export type QueryActivePromosOutput = z.infer<typeof QueryActivePromosOutput>;

/**
 * Redeem Promo Input
 */
export const RedeemPromoInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  promoId: z.string(),
  customerId: z.string().nullable().optional(),
  deviceId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
});

export type RedeemPromoInput = z.infer<typeof RedeemPromoInput>;

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

export type RedeemPromoOutput = z.infer<typeof RedeemPromoOutput>;

/**
 * Evaluate For Order Input
 * For future POS integration
 */
export const EvaluateForOrderInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  orderItems: z.array(
    z.object({
      itemId: z.string().optional(),
      categoryId: z.string().optional(),
      amount: z.number(),
      quantity: z.number().optional(),
    })
  ),
});

export type EvaluateForOrderInput = z.infer<typeof EvaluateForOrderInput>;

/**
 * Evaluate For Order Output
 */
export const EvaluateForOrderOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    applicablePromos: z.array(
      z.object({
        promoId: z.string(),
        name: z.string(),
        type: z.string(),
        discountValue: z.number(),
        discountAmount: z.number(), // Calculated discount amount
      })
    ),
  }),
});

export type EvaluateForOrderOutput = z.infer<typeof EvaluateForOrderOutput>;

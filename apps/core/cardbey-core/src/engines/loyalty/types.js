/**
 * Loyalty Engine Types
 * Zod schemas for input/output validation
 */

import { z } from 'zod';

/**
 * Configure Program Input
 */
export const ConfigureProgramInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  programId: z.string().nullable(),
  name: z.string(),
  stampsRequired: z.number().min(1),
  reward: z.string(),
  expiresAt: z.string().nullable(),
});

/**
 * Configure Program Output
 */
export const ConfigureProgramOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    programId: z.string(),
  }),
});

/**
 * Generate Assets Input
 */
export const GenerateAssetsInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  programId: z.string(),
  theme: z.string().optional(),
  format: z.array(z.string()).optional(),
});

/**
 * Generate Assets Output
 */
export const GenerateAssetsOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    qrUrl: z.string(),
    cardImageUrl: z.string(),
    pdfUrl: z.string(),
  }),
});

/**
 * Query Customer Status Input
 */
export const QueryCustomerStatusInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  customerId: z.string(),
  programId: z.string(),
});

/**
 * Query Customer Status Output
 */
export const QueryCustomerStatusOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    count: z.number(),
    stampsRequired: z.number(),
    rewardPending: z.boolean(),
    rewardEligible: z.boolean(),
  }),
});

/**
 * Add Stamp Input
 */
export const AddStampInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  customerId: z.string(),
  programId: z.string(),
});

/**
 * Add Stamp Output
 */
export const AddStampOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    newCount: z.number(),
  }),
});

/**
 * Redeem Reward Input
 */
export const RedeemRewardInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  customerId: z.string(),
  programId: z.string(),
});

/**
 * Redeem Reward Output
 */
export const RedeemRewardOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    reward: z.string(),
    redeemedAt: z.string(),
  }),
});




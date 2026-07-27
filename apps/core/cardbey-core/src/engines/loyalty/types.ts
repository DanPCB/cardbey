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

export type ConfigureProgramInput = z.infer<typeof ConfigureProgramInput>;

/**
 * Configure Program Output
 */
export const ConfigureProgramOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    programId: z.string(),
  }),
});

export type ConfigureProgramOutput = z.infer<typeof ConfigureProgramOutput>;

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

export type GenerateAssetsInput = z.infer<typeof GenerateAssetsInput>;

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

export type GenerateAssetsOutput = z.infer<typeof GenerateAssetsOutput>;

/**
 * Query Customer Status Input
 */
export const QueryCustomerStatusInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  customerId: z.string(),
  programId: z.string(),
});

export type QueryCustomerStatusInput = z.infer<typeof QueryCustomerStatusInput>;

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

export type QueryCustomerStatusOutput = z.infer<typeof QueryCustomerStatusOutput>;

/**
 * Add Stamp Input
 */
export const AddStampInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  customerId: z.string(),
  programId: z.string(),
});

export type AddStampInput = z.infer<typeof AddStampInput>;

/**
 * Add Stamp Output
 */
export const AddStampOutput = z.object({
  ok: z.boolean(),
  data: z.object({
    newCount: z.number(),
  }),
});

export type AddStampOutput = z.infer<typeof AddStampOutput>;

/**
 * Redeem Reward Input
 */
export const RedeemRewardInput = z.object({
  tenantId: z.string(),
  storeId: z.string(),
  customerId: z.string(),
  programId: z.string(),
});

export type RedeemRewardInput = z.infer<typeof RedeemRewardInput>;

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

export type RedeemRewardOutput = z.infer<typeof RedeemRewardOutput>;



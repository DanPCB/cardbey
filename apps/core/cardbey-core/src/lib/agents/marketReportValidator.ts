/**
 * Runtime validation for MarketReport (researcher agent output).
 * All researcher entry points use assertMarketReport after callAsAgent.
 */

import { z } from 'zod';

const geoContextSchema = z.object({
  suburb: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  timezone: z.string(),
});

const competitorSchema = z.object({
  name: z.string(),
  priceRange: z.object({ low: z.number(), high: z.number() }),
  promotionFrequency: z.enum(['high', 'medium', 'low']),
  notes: z.string().nullable(),
});

export const marketReportSchema = z.object({
  goal: z.string().min(1),
  location: geoContextSchema,
  competitors: z.array(competitorSchema),
  audienceProfile: z.object({
    peakDays: z.array(z.string()),
    peakHours: z.array(z.string()),
    demographics: z.string(),
  }),
  pricingBenchmark: z.object({
    low: z.number(),
    mid: z.number(),
    high: z.number(),
  }),
  recommendedDiscount: z.number().min(0).max(100),
  seasonalFactors: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  generatedAt: z.string().min(1),
});

export type MarketReportValidated = z.infer<typeof marketReportSchema>;

/**
 * Validates raw LLM output. Returns { success: true, data } or { success: false, error }.
 * Use when you need to inspect validation errors without throwing.
 */
export function validateMarketReport(raw: unknown): z.SafeParseReturnType<MarketReportValidated, MarketReportValidated> {
  return marketReportSchema.safeParse(raw);
}

/**
 * Parses and validates; throws with field-level detail if invalid.
 * Use at the researcher boundary so callers can catch and handle (422, abort step, etc.).
 */
export function assertMarketReport(raw: unknown): MarketReportValidated {
  const result = marketReportSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const msg = result.error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
  throw new Error(`MarketReport validation failed: ${msg}`);
}

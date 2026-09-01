import { z } from 'zod';
import {
  HAS_CATEGORIES,
  MARKET_ACTOR_ROLES,
  MARKET_INTENT_FAMILIES,
  MARKET_SIDES,
  WANTS_CATEGORIES,
} from './constants.js';

const evidenceSchema = z.object({
  statement: z.string().min(1),
  span: z.string().nullable().optional(),
  basis: z.enum(['EXPLICIT', 'INFERRED']),
  confidence: z.number().min(0).max(1),
});

const hasWantsItemSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  basis: z.enum(['EXPLICIT', 'INFERRED']),
  evidence: z.array(evidenceSchema).default([]),
});

export const marketIntentLlmResponseSchema = z.object({
  classification: z.enum(['COMMERCIAL', 'NON_COMMERCIAL', 'AMBIGUOUS']),
  classificationConfidence: z.number().min(0).max(1),
  classificationReason: z.string().min(1),
  classificationEvidence: z.array(evidenceSchema).default([]),
  intents: z
    .array(
      z.object({
        family: z.enum(MARKET_INTENT_FAMILIES),
        confidence: z.number().min(0).max(1),
        basis: z.enum(['EXPLICIT', 'INFERRED']),
        evidence: z.array(evidenceSchema).default([]),
      }),
    )
    .default([]),
  has: z.array(hasWantsItemSchema).default([]),
  wants: z.array(hasWantsItemSchema).default([]),
  actorHint: z.string().nullable().optional(),
  businessHint: z.string().nullable().optional(),
  locationHint: z.string().nullable().optional(),
  actorRole: z
    .object({
      primary: z.enum(MARKET_ACTOR_ROLES),
      secondary: z.array(z.enum(MARKET_ACTOR_ROLES)).default([]),
      confidence: z.number().min(0).max(1).optional(),
      reason: z.string().optional(),
      evidence: z.array(evidenceSchema).default([]),
    })
    .optional(),
  marketSide: z
    .object({
      side: z.enum(MARKET_SIDES),
      confidence: z.number().min(0).max(1).optional(),
      reason: z.string().optional(),
    })
    .optional(),
  constraints: z
    .array(
      z.object({
        label: z.string(),
        kind: z.enum(['QUANTITY', 'BUDGET', 'TIMING', 'GEOGRAPHY', 'QUALITY', 'OTHER']),
        basis: z.enum(['EXPLICIT', 'INFERRED']),
        confidence: z.number().min(0).max(1),
        evidence: z.array(evidenceSchema).default([]),
      }),
    )
    .optional(),
  preferences: z
    .array(
      z.object({
        label: z.string(),
        basis: z.enum(['EXPLICIT', 'INFERRED']),
        confidence: z.number().min(0).max(1),
        evidence: z.array(evidenceSchema).default([]),
      }),
    )
    .optional(),
  timeHorizon: z
    .object({
      label: z.string(),
      basis: z.enum(['EXPLICIT', 'INFERRED']),
      confidence: z.number().min(0).max(1),
      evidence: z.array(evidenceSchema).default([]),
    })
    .nullable()
    .optional(),
  budgetEvidence: z
    .object({
      label: z.string(),
      basis: z.enum(['EXPLICIT', 'INFERRED']),
      confidence: z.number().min(0).max(1),
      evidence: z.array(evidenceSchema).default([]),
    })
    .nullable()
    .optional(),
});

export type MarketIntentLlmResponse = z.infer<typeof marketIntentLlmResponseSchema>;

export function sanitizeHasWantsType(
  raw: string,
  allowed: readonly string[],
): string {
  const upper = String(raw ?? '').trim().toUpperCase();
  return (allowed as readonly string[]).includes(upper) ? upper : 'OTHER';
}

export function parseMarketIntentLlmResponse(raw: string): MarketIntentLlmResponse {
  let parsed: unknown;
  try {
    const cleaned = String(raw)
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    parsed = JSON.parse(cleaned || '{}');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from market intent extractor: ${message}`);
  }

  const result = marketIntentLlmResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed for market intent extractor: ${result.error.message}`);
  }

  return {
    ...result.data,
    has: result.data.has.map((item) => ({
      ...item,
      type: sanitizeHasWantsType(item.type, HAS_CATEGORIES),
    })),
    wants: result.data.wants.map((item) => ({
      ...item,
      type: sanitizeHasWantsType(item.type, WANTS_CATEGORIES),
    })),
  };
}

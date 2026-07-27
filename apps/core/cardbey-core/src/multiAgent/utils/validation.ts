/**
 * Response validation helpers for agent JSON outputs.
 */

import { z } from 'zod';
import { Intent } from '../types/agent.types.js';

export const IntentSchema = z.object({
  intent: z.nativeEnum(Intent),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.unknown()).optional(),
  needs_clarification: z.boolean().optional(),
  missing_fields: z.array(z.string()).optional(),
});

export const PlanStepSchema = z.object({
  action: z.string().min(1),
  parameters: z.record(z.unknown()).default({}),
  validation: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

export const PlanSchema = z.object({
  steps: z.array(PlanStepSchema).min(1),
  requiredTools: z.array(z.string()).default([]),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  dependencies: z.record(z.array(z.string())).default({}),
  estimatedDuration: z.number().optional(),
});

export const ReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  risks: z.array(z.string()).optional(),
});

export function safeParseJson<T>(
  content: string,
  schema: z.ZodSchema<T>,
  fallbackLabel: string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content || '{}');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from ${fallbackLabel}: ${message}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Schema validation failed for ${fallbackLabel}: ${result.error.message}`,
    );
  }
  return result.data;
}

export function extractJsonFromContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

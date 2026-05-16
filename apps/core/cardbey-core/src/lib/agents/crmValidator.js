/**
 * crmValidator.js
 * Zod validation for LeadLog and LeadEntry — matches contracts/index.ts.
 */
import { z } from 'zod';

const LeadEntrySchema = z.object({
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  intent: z.enum(['purchase', 'inquiry', 'complaint', 'other']),
  message: z.string().min(1),
  channel: z.string().min(1),
  autoReplied: z.boolean(),
  flaggedForOwner: z.boolean(),
  createdAt: z.string().min(1),
});

export const LeadLogSchema = z.object({
  missionRunId: z.string().min(1),
  entries: z.array(LeadEntrySchema),
  totalInquiries: z.number().int().min(0),
  conversionRate: z.number().min(0).max(1).nullable(),
});

export function validateLeadLog(raw) {
  const result = LeadLogSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    raw,
  };
}

export function assertLeadLog(raw) {
  const result = validateLeadLog(raw);
  if (!result.success) {
    throw new Error(`LeadLog validation failed:\n${result.errors.join('\n')}`);
  }
  return result.data;
}


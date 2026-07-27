/**
 * System Watcher Types
 * Types for system monitoring, insights, and chat interface
 */

import { z } from 'zod';

// ============================================================================
// Insight Severity
// ============================================================================

export const SystemWatcherInsightSeveritySchema = z.enum([
  'info',
  'low',
  'medium',
  'high',
  'critical',
]);

export type SystemWatcherInsightSeverity = z.infer<
  typeof SystemWatcherInsightSeveritySchema
>;

// ============================================================================
// System Insight
// ============================================================================

export const SystemWatcherInsightActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['navigate', 'command', 'explain_more']),
  target: z.string().optional(),
  payload: z.any().optional(),
});

export type SystemWatcherInsightAction = z.infer<
  typeof SystemWatcherInsightActionSchema
>;

export const SystemWatcherInsightSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SystemWatcherInsightSeveritySchema,
  summary: z.string(),
  category: z.enum([
    'devices',
    'ai_pipelines',
    'campaigns',
    'performance',
    'security',
    'other',
  ]),
  createdAt: z.string(), // ISO string
  context: z.record(z.any()).optional(),
  actions: z.array(SystemWatcherInsightActionSchema).optional(),
});

export type SystemWatcherInsight = z.infer<typeof SystemWatcherInsightSchema>;

// ============================================================================
// System Suggestion
// ============================================================================

export const SystemWatcherSuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  severity: SystemWatcherInsightSeveritySchema,
  actionType: z.enum([
    'navigate',
    'command',
    'config_change',
    'investigate',
  ]),
  target: z.string().optional(),
  payload: z.any().optional(),
});

export type SystemWatcherSuggestion = z.infer<
  typeof SystemWatcherSuggestionSchema
>;

// ============================================================================
// System Watcher Result
// ============================================================================

export const SystemWatcherResultSchema = z.object({
  summary: z.string(),
  insights: z.array(SystemWatcherInsightSchema),
  suggestions: z.array(SystemWatcherSuggestionSchema),
});

export type SystemWatcherResult = z.infer<typeof SystemWatcherResultSchema>;


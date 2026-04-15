/**
 * Shared AI Types Package
 * Unified TypeScript types for AI outputs and orchestrator results
 * Shared across backend and frontend
 */

import { z } from 'zod';

// ============================================================================
// Generic AI Result Envelope
// ============================================================================

export const AIResultSchema = z.object({
  version: z.string(), // e.g. "v1", "v2"
  type: z.string(), // e.g. "loyalty", "menu", "signage", "ideas"
  payload: z.any(), // Type-specific payload
  confidence: z.number().min(0).max(1).optional(),
  raw: z.any().optional(), // provider-specific debug data
});

export type AIResult<TPayload = any> = {
  version: string;
  type: string;
  payload: TPayload;
  confidence?: number;
  raw?: any;
};

// ============================================================================
// Loyalty From Card Types
// ============================================================================

export const LoyaltyRulesSchema = z.object({
  stampsRequired: z.number().int().min(1),
  rewardDescription: z.string(),
  expiryPolicy: z.string().optional(),
  notes: z.string().optional(),
});

export type LoyaltyRules = z.infer<typeof LoyaltyRulesSchema>;

export const LoyaltyIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['promotion', 'upsell', 'retention', 'other']),
});

export type LoyaltyIdea = z.infer<typeof LoyaltyIdeaSchema>;

export const LoyaltyFromCardPayloadSchema = z.object({
  rules: LoyaltyRulesSchema,
  ideas: z.array(LoyaltyIdeaSchema),
});

export type LoyaltyFromCardPayload = z.infer<typeof LoyaltyFromCardPayloadSchema>;

export const LoyaltyFromCardResultSchema = AIResultSchema.extend({
  type: z.literal('loyalty'),
  payload: LoyaltyFromCardPayloadSchema,
});

export type LoyaltyFromCardResult = AIResult<LoyaltyFromCardPayload> & {
  type: 'loyalty';
};

// ============================================================================
// Menu From Photo Types
// ============================================================================

export const MenuItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  category: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export type MenuItem = z.infer<typeof MenuItemSchema>;

export const MenuFromPhotoPayloadSchema = z.object({
  items: z.array(MenuItemSchema),
});

export type MenuFromPhotoPayload = z.infer<typeof MenuFromPhotoPayloadSchema>;

export const MenuFromPhotoResultSchema = AIResultSchema.extend({
  type: z.literal('menu'),
  payload: MenuFromPhotoPayloadSchema,
});

export type MenuFromPhotoResult = AIResult<MenuFromPhotoPayload> & {
  type: 'menu';
};

// ============================================================================
// Creative Ideas Types
// ============================================================================

export const CreativeIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  target: z.enum(['loyalty', 'menu', 'signage', 'campaign', 'other']).optional(),
});

export type CreativeIdea = z.infer<typeof CreativeIdeaSchema>;

export const CreativeIdeasPayloadSchema = z.object({
  ideas: z.array(CreativeIdeaSchema),
});

export type CreativeIdeasPayload = z.infer<typeof CreativeIdeasPayloadSchema>;

export const CreativeIdeasResultSchema = AIResultSchema.extend({
  type: z.literal('ideas'),
  payload: CreativeIdeasPayloadSchema,
});

export type CreativeIdeasResult = AIResult<CreativeIdeasPayload> & {
  type: 'ideas';
};

// ============================================================================
// Signage/Playlist Types
// ============================================================================

export const SignageAssetSchema = z.object({
  id: z.string(),
  url: z.string(),
  type: z.enum(['image', 'video', 'html']),
  durationS: z.number().optional(),
});

export type SignageAsset = z.infer<typeof SignageAssetSchema>;

export const SignageFromMenuPayloadSchema = z.object({
  playlistId: z.string(),
  assets: z.array(SignageAssetSchema),
  deviceCount: z.number().optional(),
});

export type SignageFromMenuPayload = z.infer<typeof SignageFromMenuPayloadSchema>;

export const SignageFromMenuResultSchema = AIResultSchema.extend({
  type: z.literal('signage'),
  payload: SignageFromMenuPayloadSchema,
});

export type SignageFromMenuResult = AIResult<SignageFromMenuPayload> & {
  type: 'signage';
};

// ============================================================================
// Union Type for All Results
// ============================================================================

export type OrchestratorResult =
  | LoyaltyFromCardResult
  | MenuFromPhotoResult
  | CreativeIdeasResult
  | SignageFromMenuResult;

// ============================================================================
// Entry Point Types
// ============================================================================

export const OrchestratorEntryPointSchema = z.enum([
  'loyalty_from_card',
  'menu_from_photo',
  'shopfront_signage',
  'creative_ideas',
]);

export type OrchestratorEntryPoint = z.infer<typeof OrchestratorEntryPointSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Type guard to check if result is a LoyaltyFromCardResult
 */
export function isLoyaltyFromCardResult(
  result: OrchestratorResult
): result is LoyaltyFromCardResult {
  return result.type === 'loyalty';
}

/**
 * Type guard to check if result is a MenuFromPhotoResult
 */
export function isMenuFromPhotoResult(
  result: OrchestratorResult
): result is MenuFromPhotoResult {
  return result.type === 'menu';
}

/**
 * Type guard to check if result is a CreativeIdeasResult
 */
export function isCreativeIdeasResult(
  result: OrchestratorResult
): result is CreativeIdeasResult {
  return result.type === 'ideas';
}

/**
 * Type guard to check if result is a SignageFromMenuResult
 */
export function isSignageFromMenuResult(
  result: OrchestratorResult
): result is SignageFromMenuResult {
  return result.type === 'signage';
}

// ============================================================================
// System Watcher Types
// ============================================================================

export * from './systemWatcher.js';

// ============================================================================
// MI (Merged Intelligence) Types
// ============================================================================
// Re-export MI types from the core source
// Note: These types are defined in apps/core/cardbey-core/src/mi/miTypes.ts
// and are re-exported here for shared use across backend and frontend

export type {
  MIProductType,
  MIMediaType,
  MIBrainRole,
  MIFormat,
  MIOrigin,
  MIEnvironmentHints,
  MIContext,
  MIPersonalisation,
  MILocalisation,
  MIChannelAdaptation,
  MIDynamicLayout,
  MIDataBinding,
  MIDataBindings,
  MICapabilities,
  MIActionType,
  MIBehaviorAction,
  MIBehaviorRules,
  MICTA,
  MICTAPlan,
  MIAnalyticsPlan,
  MIStatus,
  MIRegenerationPolicy,
  MILifecycle,
  MIBrain,
  MIEntity,
} from '../../src/mi/miTypes.js';



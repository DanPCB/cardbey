/**
 * Loyalty intake classification overrides — text/attachment signals that must
 * win over create_campaign, create_store, or other misroutes.
 */

import { Features } from '../../config/features.js';

/**
 * @param {Record<string, unknown>} classification
 * @param {{
 *   userMessage: string;
 *   attachmentAnalysis?: object | null;
 *   dispatchStoreId?: string | null;
 *   effectiveStoreId?: string | null;
 *   isLoyaltyCardAttachment: (analysis: unknown) => boolean;
 *   shouldPreferLoyaltyOverCampaign: (text: string, analysis?: unknown) => boolean;
 *   isLoyaltyCompilerTool: (classification: Record<string, unknown>) => boolean;
 * }} ctx
 * @returns {Record<string, unknown> | null} Updated classification, or null if no override.
 */
export function applyLoyaltyTextIntentOverride(classification, ctx) {
  const probeText = String(ctx.userMessage ?? '').trim();
  if (!probeText) return null;
  if (ctx.isLoyaltyCompilerTool(classification)) return null;
  if (!ctx.shouldPreferLoyaltyOverCampaign(probeText, ctx.attachmentAnalysis ?? null)) {
    return null;
  }

  const priorTool = String(classification?.tool ?? '').trim() || null;
  const priorParams =
    classification?.parameters &&
    typeof classification.parameters === 'object' &&
    !Array.isArray(classification.parameters)
      ? classification.parameters
      : {};

  const overrideReason = ctx.isLoyaltyCardAttachment(ctx.attachmentAnalysis)
    ? 'loyalty_card_attachment'
    : priorTool === 'create_store'
      ? 'loyalty_intent_over_store'
      : priorTool === 'create_campaign'
        ? 'loyalty_intent_over_campaign'
        : 'loyalty_intent_text_lock';

  const source =
    priorTool === 'create_store'
      ? 'loyalty_overrode_store'
      : priorTool === 'create_campaign'
        ? 'loyalty_overrode_campaign'
        : 'loyalty_text_intent_lock';

  return {
    classification: {
      ...classification,
      executionPath: Features.loyalty.useSpine ? 'loyalty_chat_compile' : 'proactive_plan',
      tool: 'setup_loyalty_program',
      confidence: Math.max(Number(classification?.confidence) || 0, 0.97),
      parameters: {
        ...priorParams,
        ...(ctx.dispatchStoreId || ctx.effectiveStoreId
          ? { storeId: ctx.dispatchStoreId ?? ctx.effectiveStoreId }
          : {}),
        ...(ctx.attachmentAnalysis
          ? {
              preseededDraft:
                priorParams.preseededDraft ?? ctx.attachmentAnalysis.preseededDraft,
              attachmentAnalysis: ctx.attachmentAnalysis,
            }
          : {}),
        source,
      },
      _requiresStore: true,
      requiresStore: true,
      _compilerEligible: true,
      _classificationSource: source,
    },
    telemetry: {
      pathId: priorTool === 'create_store' ? 'loyalty_overrode_store' : 'loyalty_overrode_campaign',
      reason: overrideReason,
      originalTool: priorTool,
      finalTool: 'setup_loyalty_program',
    },
  };
}

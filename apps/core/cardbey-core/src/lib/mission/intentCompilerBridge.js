/**
 * IntentReasoner classification → multi-agent compiler bridge (Phase 2 intake wiring).
 */

import { compileWithMultiAgent } from '../agents/compileWithMultiAgent.js';

/** Tools routed through compileWithMultiAgent (not legacy checkpoint dispatch). */
export const MULTI_AGENT_COMPILER_TOOLS = new Set(['create_campaign']);

/**
 * @param {Record<string, unknown>} classification
 */
export function shouldUseMultiAgentCompiler(classification) {
  const tool = String(classification?.tool ?? '').trim();
  return MULTI_AGENT_COMPILER_TOOLS.has(tool);
}

/**
 * @param {Record<string, unknown>} classification
 * @param {{
 *   missionId: string;
 *   sessionId?: string | null;
 *   storeId?: string | null;
 *   userId?: string | null;
 *   tenantKey?: string;
 *   locale?: string;
 *   intentText?: string;
 * }} context
 */
export async function compileFromClassification(classification, context) {
  if (!shouldUseMultiAgentCompiler(classification)) {
    return null;
  }

  const intentText = pickIntentText(classification, context);
  if (!intentText) {
    throw new Error('compileFromClassification requires intent text');
  }
  if (!context?.missionId?.trim()) {
    throw new Error('compileFromClassification requires context.missionId');
  }

  const storeId =
    context.storeId ??
    (classification.parameters &&
    typeof classification.parameters === 'object' &&
    !Array.isArray(classification.parameters)
      ? classification.parameters.storeId
      : null);

  return compileWithMultiAgent(
    {
      text: intentText,
      tool: String(classification.tool),
      storeId: storeId != null ? String(storeId) : null,
      parameters:
        classification.parameters &&
        typeof classification.parameters === 'object' &&
        !Array.isArray(classification.parameters)
          ? classification.parameters
          : {},
    },
    {
      missionId: context.missionId,
      sessionId: context.sessionId ?? null,
      storeId: storeId != null ? String(storeId) : null,
      userId: context.userId ?? null,
      tenantKey: context.tenantKey ?? context.userId ?? 'default',
      locale: context.locale ?? 'en',
    },
  );
}

/**
 * Classify via IntentIntegration, compile when eligible.
 *
 * @param {import('../intent/intentIntegration.js').IntentIntegration} integration
 * @param {{
 *   userId: string;
 *   sessionId: string;
 *   input: Record<string, unknown>;
 *   classifyOpts?: Record<string, unknown>;
 *   req?: import('express').Request;
 *   compileContext: Parameters<typeof compileFromClassification>[1];
 * }} params
 */
export async function classifyAndCompileIfEligible(integration, params) {
  const classification = await integration.processIntake({
    userId: params.userId,
    sessionId: params.sessionId,
    input: params.input,
    classifyOpts: params.classifyOpts,
    req: params.req,
  });

  const compileResult = await compileFromClassification(classification, {
    ...params.compileContext,
    intentText:
      params.compileContext.intentText ??
      String(params.classifyOpts?.userMessage ?? params.input?.text ?? ''),
  });

  return {
    classification,
    compileResult,
    compiled: compileResult != null,
  };
}

/**
 * @param {Record<string, unknown>} classification
 * @param {{ intentText?: string }} context
 */
function pickIntentText(classification, context) {
  const fromContext = String(context.intentText ?? '').trim();
  if (fromContext) return fromContext;

  const params =
    classification.parameters &&
    typeof classification.parameters === 'object' &&
    !Array.isArray(classification.parameters)
      ? classification.parameters
      : {};

  return String(params.campaignContext ?? params.hint ?? params.goal ?? '').trim();
}

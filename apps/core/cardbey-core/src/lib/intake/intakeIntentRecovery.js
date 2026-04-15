/**
 * Back-compat recovery hook — delegates to centralized intent resolver + ontology.
 */

import { getToolEntry, isRegisteredTool } from './intakeToolRegistry.js';
import { CONFIDENCE_HIGH } from './intakeExecutionPolicy.js';
import { resolveIntent } from './intakeIntentResolver.js';

export { CONFIDENCE_HIGH };

/**
 * @param {{ userMessage: string, classification: object, locale?: string, storeId?: string | null, draftId?: string | null, conversationHistory?: Array<{ role?: string, content?: string }>, persistedIntentResolution?: object | null }} input
 * @returns {{ recovered: boolean, tool?: string, parameters?: Record<string, unknown>, recoveryReason?: string, resolution?: import('./intakeIntentResolver.js').IntentResolutionResult }}
 */
export function attemptIntentRecovery(input) {
  const resolution = resolveIntent({
    userMessage: input.userMessage,
    classification: input.classification,
    storeId: input.storeId ?? null,
    draftId: input.draftId ?? null,
    conversationHistory: Array.isArray(input.conversationHistory) ? input.conversationHistory : [],
    persistedIntentResolution: input.persistedIntentResolution ?? null,
  });
  if (resolution.recovered && resolution.chosenTool) {
    return {
      recovered: true,
      tool: resolution.chosenTool,
      parameters: resolution.extractedParameters,
      recoveryReason: resolution.resolverReason ?? 'intent_resolver',
      resolution,
    };
  }
  return { recovered: false, resolution };
}

/**
 * @param {object} classification
 * @param {{ recovered: boolean, tool?: string, parameters?: Record<string, unknown>, recoveryReason?: string }} recovery
 */
export function mergeRecoveredClassification(classification, recovery) {
  if (!recovery?.recovered || !recovery.tool || !isRegisteredTool(recovery.tool)) {
    return classification;
  }
  const fe = getToolEntry(recovery.tool);
  if (!fe) return classification;
  const prevConf =
    typeof classification.confidence === 'number' && !Number.isNaN(classification.confidence)
      ? classification.confidence
      : 0;
  const next = {
    ...classification,
    tool: recovery.tool,
    parameters: {
      ...(classification.parameters && typeof classification.parameters === 'object' ? classification.parameters : {}),
      ...(recovery.parameters && typeof recovery.parameters === 'object' ? recovery.parameters : {}),
    },
    executionPath: fe.executionPath,
    confidence: Math.max(prevConf, CONFIDENCE_HIGH),
    clarifyOptions: undefined,
    message: undefined,
    _intentRecovery: recovery.recoveryReason ?? 'heuristic',
  };
  const res = recovery.resolution;
  if (res && typeof res.family === 'string' && typeof res.subtype === 'string') {
    next._intentResolution = {
      family: res.family,
      subtype: res.subtype,
      resolverReason: res.resolverReason ?? null,
    };
  }
  return next;
}

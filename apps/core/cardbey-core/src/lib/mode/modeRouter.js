/**
 * Phase 1 / Phase 3 — Mode router.
 * Manual: skip reasoning, enforce governance, shared execution path.
 * Automation: full reasoning via IntentReasoner in intake routes (no legacy fallback).
 */

import {
  createModeResponseMeta,
  resolvePerformerMode,
  resolvePerformerSource,
} from './modeTypes.js';
import { checkRuntimeAuthority, resolveManualActionTool } from './checkRuntimeAuthority.js';

export { resolvePerformerMode, resolvePerformerSource, createModeResponseMeta };

/**
 * Build intake classification for manual mode (no reasoner / legacy classifier).
 *
 * @param {object} input
 * @param {string} [input.action]
 * @param {string} [input.source]
 * @param {Record<string, unknown>} [input.parameters]
 * @param {string | null} [input.storeId]
 * @param {string | null} [input.draftId]
 * @param {string} [input.intentText]
 */
export function buildManualClassification(input = {}) {
  const actionKey = String(input.action ?? input.explicitAction ?? '').trim();
  const mapped = resolveManualActionTool(actionKey);

  if (!mapped) {
    return {
      executionPath: 'clarify',
      tool: 'general_chat',
      confidence: 0.5,
      parameters: {},
      message: 'Choose an action from the manual mode buttons.',
      _classificationSource: 'manual_mode_unresolved',
      _performerMode: 'manual',
    };
  }

  const parameters = {
    ...(input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
      ? input.parameters
      : {}),
    ...(input.storeId ? { storeId: input.storeId } : {}),
    ...(input.draftId ? { draftId: input.draftId } : {}),
    ...(input.intentText ? { intentText: input.intentText } : {}),
    _performerMode: 'manual',
    _performerSource: input.source ?? 'button',
    _manualAction: actionKey,
  };

  return {
    executionPath: mapped.executionPath,
    tool: mapped.tool,
    confidence: mapped.confidence,
    parameters,
    _classificationSource: 'manual_mode',
    _performerMode: 'manual',
    _skipReasoning: true,
  };
}

/**
 * Resolve manual intake: authority gate + classification.
 *
 * @param {object} input
 * @param {import('express').Request} input.req
 * @param {Record<string, unknown>} input.body
 * @param {string | null} [input.storeId]
 * @param {string | null} [input.draftId]
 * @param {string | null} [input.userId]
 * @param {boolean} [input.isGuest]
 */
export async function resolveManualIntakeRequest(input = {}) {
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const mode = resolvePerformerMode(input.req, body);
  const source = resolvePerformerSource(input.req, body);

  if (mode !== 'manual') {
    return { handled: false, mode, source };
  }

  const action = String(body.action ?? body.explicitAction ?? '').trim();
  const isExplicitManual =
    Boolean(action) || source === 'button' || source === 'quick_action';

  if (!isExplicitManual) {
    return {
      handled: false,
      mode,
      source,
      meta: createModeResponseMeta('manual', {
        reasoningUsed: false,
        executionPath: 'manual_direct',
        metadata: { hint: 'manual_mode_requires_explicit_action' },
      }),
    };
  }

  const classification = buildManualClassification({
    action,
    source,
    parameters: body.parameters,
    storeId: input.storeId,
    draftId: input.draftId,
    intentText: String(body.text ?? body.goal ?? '').trim() || undefined,
  });

  if (classification.executionPath === 'clarify') {
    return {
      handled: true,
      mode,
      source,
      classification,
      blocked: false,
      meta: createModeResponseMeta('manual', {
        reasoningUsed: false,
        executionPath: 'manual_direct',
        tool: classification.tool,
      }),
    };
  }

  const authority = await checkRuntimeAuthority({
    action: { tool: classification.tool, parameters: classification.parameters },
    userId: input.userId,
    isGuest: input.isGuest,
    context: { activeStoreId: input.storeId, activeDraftId: input.draftId },
    mode: 'manual',
    source: 'manual',
  });

  const meta = createModeResponseMeta('manual', {
    reasoningUsed: false,
    governanceEnforced: true,
    executionPath: authority.allowed ? 'manual_governed' : 'manual_governed',
    tool: classification.tool,
    metadata: { authority },
  });

  if (!authority.allowed) {
    return {
      handled: true,
      mode,
      source,
      classification,
      blocked: true,
      authority,
      meta,
    };
  }

  return {
    handled: true,
    mode,
    source,
    classification,
    blocked: false,
    authority,
    meta,
    skipReasoning: true,
  };
}

/**
 * Intake route integration for the intent-first engine.
 */

import { Features } from '../config/features.js';
import {
  getIntentOrchestrator,
  intentResultToIntakeResponse,
  intentResultToClassification,
  isIntentEngineEarlyReturn,
  compareIntentEngineShadow,
} from './index.js';

/**
 * Build intent engine input from intake request body.
 *
 * @param {{
 *   userMessage?: string;
 *   userId?: string | null;
 *   sessionId?: string | null;
 *   activeStoreId?: string | null;
 *   primaryModeHint?: string | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   action?: string | null;
 * }} opts
 */
export function buildIntentEngineInput(opts = {}) {
  return {
    message: String(opts.userMessage ?? '').trim(),
    userId: opts.userId ?? null,
    sessionId: opts.sessionId ?? null,
    activeStoreId: opts.activeStoreId ?? null,
    primaryModeHint: opts.primaryModeHint ?? null,
    storeCreateForm: opts.storeCreateForm ?? null,
    action: opts.action ?? null,
  };
}

/**
 * Whether the legacy casual-chat short-circuit should be skipped.
 * When intent engine is primary, classification handles chat turns.
 */
export function shouldSkipLegacyCasualChatShortcircuit() {
  return Features.intentEngine.primary;
}

/**
 * Run intent-first pipeline when primary authority is enabled.
 *
 * @param {ReturnType<typeof buildIntentEngineInput>} input
 * @returns {Promise<{ earlyResponse: Record<string, unknown> | null; classification: Record<string, unknown> | null }>}
 */
export async function runIntentEnginePrimary(input) {
  if (!Features.intentEngine.primary) {
    return { earlyResponse: null, classification: null };
  }

  const orchestrator = getIntentOrchestrator();
  const result = await orchestrator.process(input);

  if (isIntentEngineEarlyReturn(result)) {
    return {
      earlyResponse: intentResultToIntakeResponse(result),
      classification: null,
    };
  }

  return {
    earlyResponse: null,
    classification: intentResultToClassification(result),
  };
}

/**
 * Phase 1 shadow compare — non-blocking, read-only.
 *
 * @param {ReturnType<typeof buildIntentEngineInput>} input
 * @param {Record<string, unknown> | null | undefined} legacyClassification
 */
export async function runIntentEngineShadow(input, legacyClassification) {
  if (!Features.intentEngine.shadow) return null;

  try {
    const orchestrator = getIntentOrchestrator();
    const result = await orchestrator.process(input);
    const comparison = compareIntentEngineShadow(result, {
      action: legacyClassification?.executionPath === 'clarify' ? 'clarify' : legacyClassification?.executionPath,
      tool: legacyClassification?.tool,
      executionPath: legacyClassification?.executionPath,
    });

    if (Features.intentEngine.shadowLog) {
      console.log('[intent-engine/shadow]', JSON.stringify({
        message: input.message?.slice(0, 80),
        shadowIntent: comparison.shadowIntent,
        shadowAction: comparison.shadowAction,
        legacyTool: comparison.legacyTool,
        agree: comparison.agree,
        divergences: comparison.divergences,
        metrics: result.metrics,
      }));
    }

    return { result, comparison };
  } catch (err) {
    console.warn('[intent-engine/shadow] failed (non-blocking):', err?.message ?? err);
    return null;
  }
}

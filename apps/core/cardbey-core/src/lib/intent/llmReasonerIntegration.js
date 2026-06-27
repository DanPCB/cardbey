/**
 * LLM Reasoner integration — feature-flagged path before deterministic IntentReasoner.
 */

import { LLMReasoner } from './llmReasoner.js';
import { shouldUseIntentFastPath } from './intentFastPath.js';

/**
 * @param {string} userId
 * @returns {number} 0–99
 */
export function hashUserIdForRollout(userId) {
  const id = String(userId ?? '');
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash) % 100;
}

/**
 * @param {import('express').Request} [req]
 * @param {string} [userId]
 * @returns {boolean}
 */
export function isLlmReasonerEnabled(req, userId) {
  if (String(process.env.ENABLE_LLM_REASONER ?? '').trim().toLowerCase() !== 'true') {
    return false;
  }

  const header = req?.headers?.['x-enable-llm-reasoner'];
  if (header === 'false' || header === '0') {
    return false;
  }
  if (header === 'true' || header === '1') {
    return true;
  }

  const percentage = parseInt(process.env.LLM_REASONER_ROLLOUT_PERCENTAGE || '0', 10);
  if (!Number.isFinite(percentage) || percentage <= 0) {
    return true;
  }
  if (percentage >= 100) {
    return true;
  }

  const uid = String(userId ?? req?.user?.id ?? req?.session?.userId ?? '').trim();
  if (!uid) {
    return false;
  }

  return hashUserIdForRollout(uid) < percentage;
}

export class LLMReasonerIntegration {
  /**
   * @param {Object} options
   * @param {import('./intentReasoner.js').IntentReasoner} options.deterministicReasoner
   * @param {Console} [options.logger]
   * @param {{ track?: (event: string, props: Record<string, unknown>) => void } | null} [options.telemetry]
   */
  constructor({ deterministicReasoner, logger = console, telemetry = null }) {
    if (!deterministicReasoner) {
      throw new Error('LLMReasonerIntegration requires deterministicReasoner');
    }
    this.deterministicReasoner = deterministicReasoner;
    this.logger = logger;
    this.telemetry = telemetry;
    this.llmReasoner = new LLMReasoner({ logger });
  }

  /**
   * Try LLM reasoning; returns null when disabled so caller uses deterministic path only.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.sessionId
   * @param {Object} params.input
   * @param {Record<string, unknown>} [params.classifyOpts]
   * @param {import('express').Request} [params.req]
   * @returns {Promise<{ result: import('./intentTypes.js').IntentReasoningResult, source: 'llm'|'deterministic_fallback' } | null>}
   */
  async tryReason({ userId, sessionId, input, classifyOpts, req }) {
    if (!isLlmReasonerEnabled(req, userId)) {
      return null;
    }

    if (shouldUseIntentFastPath(input, classifyOpts ?? {})) {
      this.logger.debug?.('[LLMReasonerIntegration] Skipping LLM (fast path eligible)', {
        userId,
        sessionId,
        text: input?.text?.slice(0, 80),
      });
      return null;
    }

    const startTime = Date.now();
    const conversationHistory = Array.isArray(classifyOpts?.conversationHistory)
      ? classifyOpts.conversationHistory
      : [];

    try {
      this.logger.debug?.('[LLMReasonerIntegration] Using LLM reasoning', {
        userId,
        sessionId,
        historyLength: conversationHistory.length,
      });

      const reasonOptions = {
        conversationHistory,
        currentContext: classifyOpts?.currentContext ?? input?.currentContext ?? null,
        hydratedContext: classifyOpts?.hydratedContext ?? null,
        tenantKey: classifyOpts?.tenantKey ?? userId,
        locale: classifyOpts?.locale,
      };

      const useToolLoop = String(process.env.ENABLE_LLM_TOOL_LOOP ?? '').trim().toLowerCase() === 'true';
      const result = useToolLoop
        ? await this.llmReasoner.reasonWithTools(userId, sessionId, input, reasonOptions)
        : await this.llmReasoner.reason(userId, sessionId, input, reasonOptions);

      this._track('llm_reasoning.completed', {
        userId,
        sessionId,
        intent: result.intent,
        tool: result.tool,
        confidence: result.confidence,
        durationMs: Date.now() - startTime,
        historyLength: conversationHistory.length,
        fallback: false,
        toolLoop: useToolLoop,
        toolLoopSteps: result.metadata?.toolLoopTrace?.length ?? 0,
        thinking: Boolean(result.metadata?.thinkingTrace),
      });

      return { result, source: 'llm' };
    } catch (error) {
      this.logger.warn?.('[LLMReasonerIntegration] LLM failed, falling back to IntentReasoner', {
        userId,
        sessionId,
        error: error?.message ?? String(error),
      });

      this._track('llm_reasoning.error', {
        userId,
        sessionId,
        error: error?.message ?? String(error),
        durationMs: Date.now() - startTime,
      });

      const fallback = await this.deterministicReasoner.reason(userId, sessionId, input);
      return { result: fallback, source: 'deterministic_fallback' };
    }
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} props
   */
  _track(event, props) {
    if (this.telemetry?.track) {
      this.telemetry.track(event, props);
      return;
    }
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug?.(`[LLMReasonerIntegration] ${event}`, props);
    }
  }
}

export default LLMReasonerIntegration;

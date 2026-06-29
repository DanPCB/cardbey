/**
 * LLM Reasoner integration — feature-flagged path before deterministic IntentReasoner.
 */

import { LLMReasoner } from './llmReasoner.js';
import { shouldUseIntentFastPath } from './intentFastPath.js';
import { RagIntegration } from './ragIntegration.js';
import {
  UNAMBIGUOUS_DETERMINISTIC_INTENTS,
  isLlmMemoryPressureHigh,
  isLlmReasonerTelemetryEnabled,
  normalizeConversationHistory,
} from './llmReasonerPromptUtils.js';
import { diagLog, isLlmReasonerDiagEnabled } from '../diagnostics/storeCreationDiagnostics.js';

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
  const envVal = String(process.env.ENABLE_LLM_REASONER ?? '').trim().toLowerCase();
  if (envVal === 'false' || envVal === '0') {
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
    this.ragIntegration = new RagIntegration({ logger, telemetry });
    this.llmReasoner = new LLMReasoner({ logger, telemetry });
  }

  /**
   * @param {import('./intentTypes.js').IntentReasoningResult} result
   * @param {string} reason
   */
  _deterministicHandoff(result, reason) {
    return {
      result: {
        ...result,
        metadata: {
          ...(result.metadata ?? {}),
          llmSkipped: reason,
        },
      },
      source: /** @type {const} */ ('deterministic_fallback'),
    };
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
    const diag = isLlmReasonerDiagEnabled();
    const text = String(input?.text ?? '');
    diagLog(diag, '===== LLM Reasoner Integration =====');
    diagLog(diag, 'Input text:', text.slice(0, 200));
    diagLog(diag, 'Intent from input:', input?.intent ?? input?.forceIntent ?? null);
    diagLog(diag, 'Mode:', req?.body?.mode ?? 'unknown');
    diagLog(diag, 'ENABLE_LLM_REASONER:', process.env.ENABLE_LLM_REASONER);
    diagLog(diag, 'BYPASS_KERNEL_FOR_CREATE_STORE:', process.env.BYPASS_KERNEL_FOR_CREATE_STORE);
    diagLog(diag, 'EMERGENCY_BYPASS_KERNEL:', process.env.EMERGENCY_BYPASS_KERNEL);

    if (!isLlmReasonerEnabled(req, userId)) {
      diagLog(diag, 'LLM NOT enabled (isLlmReasonerEnabled=false)');
      return null;
    }

    if (shouldUseIntentFastPath(input, classifyOpts ?? {})) {
      diagLog(diag, '✅ FAST PATH (intentFastPath): Skipping LLM');
      this.logger.debug?.('[LLMReasonerIntegration] Skipping LLM (fast path eligible)', {
        userId,
        sessionId,
        text: input?.text?.slice(0, 80),
      });
      return null;
    }

    if (isLlmMemoryPressureHigh()) {
      const mem = process.memoryUsage();
      const allocationPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
      this.logger.warn?.(
        `[LLMReasonerIntegration] Memory pressure detected (${allocationPct}% allocated), falling back to deterministic`,
      );
      const fallback = await this.deterministicReasoner.reason(userId, sessionId, input);
      return this._deterministicHandoff(fallback, 'memory_pressure');
    }

    const deterministicPreview = await this.deterministicReasoner.reason(userId, sessionId, input);
    diagLog(diag, 'Running deterministic IntentReasoner preview...');
    diagLog(diag, 'Deterministic result:', {
      intent: deterministicPreview.intent,
      confidence: deterministicPreview.confidence,
      tool: deterministicPreview.tool,
      action: deterministicPreview.action,
      parameters: deterministicPreview.parameters,
    });

    const fastPathIntents = ['create_store', 'publish_store'];
    const isUnambiguousFastPath =
      deterministicPreview.confidence > 0.9 && UNAMBIGUOUS_DETERMINISTIC_INTENTS.has(deterministicPreview.intent);
    const isCreateStoreFastPath =
      deterministicPreview.confidence > 0.85 && fastPathIntents.includes(deterministicPreview.intent);

    diagLog(diag, 'Is unambiguous fast path?', isUnambiguousFastPath);
    diagLog(diag, 'Confidence > 0.9:', deterministicPreview.confidence > 0.9);
    diagLog(diag, 'In UNAMBIGUOUS_DETERMINISTIC_INTENTS:', UNAMBIGUOUS_DETERMINISTIC_INTENTS.has(deterministicPreview.intent));
    diagLog(diag, 'Is create_store/publish_store fast path (conf>0.85)?', isCreateStoreFastPath);

    if (isUnambiguousFastPath) {
      diagLog(diag, '✅ FAST PATH: Skipping LLM for unambiguous', deterministicPreview.intent);
      this.logger.debug?.('[LLMReasonerIntegration] Fast path: unambiguous intent', {
        userId,
        sessionId,
        intent: deterministicPreview.intent,
        confidence: deterministicPreview.confidence,
      });
      return this._deterministicHandoff(deterministicPreview, 'unambiguous_intent');
    }

    diagLog(diag, 'Fast path NOT taken, running LLMReasoner...');

    const startTime = Date.now();
    const memStart = process.memoryUsage().heapUsed;
    const conversationHistory = normalizeConversationHistory(classifyOpts?.conversationHistory);

    try {
      const ragContext = classifyOpts?.currentContext ?? input?.currentContext ?? null;
      const ragApplicable = this.ragIntegration.shouldUseRag(input, ragContext);

      this.logger.debug?.('[LLMReasonerIntegration] Using LLM reasoning', {
        userId,
        sessionId,
        historyLength: conversationHistory.length,
        ragApplicable,
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

      const memAfter = process.memoryUsage().heapUsed;
      const memoryAllocatedMB = Math.round(((memAfter - memStart) / 1024 / 1024) * 100) / 100;

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
        toolLoopUsed: Boolean(result.metadata?.toolLoopUsed),
        toolLoopSteps: result.metadata?.toolLoopTrace?.length ?? 0,
        thinking: Boolean(result.metadata?.thinkingTrace),
        ragApplicable,
        ragUsed: Boolean(result.metadata?.ragUsed),
        ragChunkCount: result.metadata?.ragSummary?.chunkCount ?? 0,
        promptBytes: result.metadata?.promptBytes ?? null,
        estimatedTokens: result.metadata?.estimatedTokens ?? null,
        memoryAllocatedMB,
      });

      return { result, source: 'llm' };
    } catch (error) {
      diagLog(diag, '❌ LLMReasoner failed, falling back to deterministic:', error?.message ?? String(error));
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

      return this._deterministicHandoff(deterministicPreview, 'llm_error');
    }
  }

  /**
   * @param {string} event
   * @param {Record<string, unknown>} props
   */
  _track(event, props) {
    if (!isLlmReasonerTelemetryEnabled()) return;
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

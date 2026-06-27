/**
 * ============================================================
 * PHASE 3 — UNIFIED INTAKE
 * ============================================================
 *
 * IntentIntegration is the only NL classification path for automation mode.
 * No legacy fallback — reasoner failures propagate to the route handler.
 */

import { IntentReasoner } from './intentReasoner.js';
import { LLMReasonerIntegration, isLlmReasonerEnabled } from './llmReasonerIntegration.js';
import { getToolEntry } from '../intake/intakeToolRegistry.js';
import { DEFAULT_REASONER_CONFIG, INTENT_REASONER_VERSION } from './constants.js';
import {
  pickMemorySummary,
  pickUnifiedMemory,
} from '../intake/intakeMemoryContext.js';
import { shouldUseIntentFastPath } from './intentFastPath.js';
import { diagLog, isLlmReasonerDiagEnabled } from '../diagnostics/storeCreationDiagnostics.js';

/** @type {IntentIntegration | null} */
let integrationSingleton = null;

/**
 * @param {Object} [options]
 * @param {import('../context/contextProvider.js').ContextProvider} [options.contextProvider]
 * @param {Console} [options.logger]
 * @param {{ track?: (event: string, props: Record<string, unknown>) => void } | null} [options.telemetry]
 * @returns {IntentIntegration}
 */
export function getIntentIntegration(options = {}) {
  if (!integrationSingleton || options.contextProvider) {
    integrationSingleton = new IntentIntegration(options);
  }
  return integrationSingleton;
}

/** @internal tests */
export function resetIntentIntegrationForTests() {
  integrationSingleton = null;
}

/**
 * Integration layer for Intent Reasoning in intake.
 */
export class IntentIntegration {
  /**
   * @param {Object} options
   * @param {import('../context/contextProvider.js').ContextProvider} options.contextProvider
   * @param {Console} [options.logger]
   * @param {{ track?: (event: string, props: Record<string, unknown>) => void } | null} [options.telemetry]
   */
  constructor({ contextProvider, logger = console, telemetry = null }) {
    if (!contextProvider) {
      throw new Error('IntentIntegration requires contextProvider');
    }

    this.contextProvider = contextProvider;
    this.logger = logger;
    this.telemetry = telemetry;

    const traceEnabled =
      process.env.INTENT_REASONER_TRACE_ENABLED === 'true' ||
      (process.env.NODE_ENV === 'development' && DEFAULT_REASONER_CONFIG.traceEnabled);

    this.reasoner = new IntentReasoner({
      contextProvider,
      logger,
      config: {
        ...DEFAULT_REASONER_CONFIG,
        minConfidenceThreshold: parseFloat(process.env.INTENT_REASONER_MIN_CONFIDENCE || '0.7'),
        maxReasoningTimeMs: parseInt(process.env.INTENT_REASONER_MAX_TIME_MS || '2000', 10),
        traceEnabled,
        guestAwareEnabled: true,
      },
    });

    this.llmReasonerIntegration = new LLMReasonerIntegration({
      deterministicReasoner: this.reasoner,
      logger,
      telemetry,
    });
  }

  /**
   * Run intent reasoning and return intake-compatible classification.
   * This is the only automation-mode classification path.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.sessionId
   * @param {Object} params.input
   * @param {Record<string, unknown>} [params.classifyOpts] - Intake metadata merged into reasoner input
   * @param {import('express').Request} [params.req]
   * @returns {Promise<Record<string, unknown>>}
   */
  async processIntake({ userId, sessionId, input, classifyOpts, req }) {
    const startTime = Date.now();
    const diag = isLlmReasonerDiagEnabled();

    try {
      diagLog(diag, '===== IntentIntegration processIntake =====');
      diagLog(diag, 'Input text:', input?.text?.slice(0, 200));
      diagLog(diag, 'Intent from input:', input?.intent ?? input?.forceIntent ?? null);
      diagLog(diag, 'source:', classifyOpts?.source ?? input?.source ?? null);
      diagLog(diag, 'ENABLE_LLM_REASONER:', process.env.ENABLE_LLM_REASONER);

      this.logger.debug?.('[IntentIntegration] Running IntentReasoner', {
        userId,
        sessionId,
        input: input.text?.slice(0, 100),
        hasAttachment: !!(input.attachments?.length || input.imageDataUrl || input.hasAttachment),
      });

      const reasonerInput = {
        ...input,
        originalUserMessage:
          classifyOpts?.originalUserMessage ?? input.originalUserMessage ?? input.text ?? '',
        storeCreateForm: classifyOpts?.storeCreateForm ?? input.storeCreateForm,
        primaryModeHint: classifyOpts?.primaryModeHint ?? input.primaryModeHint,
        action: classifyOpts?.action ?? input.action,
        parameters: classifyOpts?.parameters ?? input.parameters,
        forceIntent: classifyOpts?.forceIntent ?? input.forceIntent,
        currentFlow: classifyOpts?.currentFlow ?? input.currentFlow,
        source: classifyOpts?.source ?? input.source,
        shortcutContext: input.shortcutContext ?? classifyOpts?.shortcutContext ?? null,
        memorySummary:
          classifyOpts?.memorySummary ??
          pickMemorySummary(classifyOpts?.currentContext) ??
          input.memorySummary ??
          null,
        unifiedMemory:
          classifyOpts?.unifiedMemory ??
          pickUnifiedMemory(classifyOpts?.currentContext) ??
          input.unifiedMemory ??
          null,
        currentContext:
          classifyOpts?.currentContext &&
          typeof classifyOpts.currentContext === 'object' &&
          !Array.isArray(classifyOpts.currentContext)
            ? classifyOpts.currentContext
            : input.currentContext ?? null,
      };

      let result;
      let classificationSource = 'intent_reasoner';

      const llmEnabled = isLlmReasonerEnabled(req, userId);
      const useFastPath = llmEnabled && shouldUseIntentFastPath(reasonerInput, classifyOpts);

      diagLog(diag, 'llmEnabled:', llmEnabled);
      diagLog(diag, 'useFastPath (intentFastPath):', useFastPath);

      if (useFastPath) {
        result = await this.reasoner.reason(userId, sessionId, reasonerInput);
        classificationSource = 'fast_path';
        diagLog(diag, '✅ FAST PATH (IntentIntegration):', {
          intent: result.intent,
          confidence: result.confidence,
          tool: result.tool,
          action: result.action,
        });
        this.logger.debug?.('[IntentIntegration] Using fast path (skipping LLM)', {
          userId,
          sessionId,
          intent: result.intent,
          text: reasonerInput.text?.slice(0, 80),
        });
      } else {
        const llmAttempt = await this.llmReasonerIntegration.tryReason({
          userId,
          sessionId,
          input: reasonerInput,
          classifyOpts,
          req,
        });

        if (llmAttempt?.source === 'llm') {
          result = llmAttempt.result;
          classificationSource = 'llm_reasoner';
          this.logger.debug?.('[IntentIntegration] LLMReasoner completed', {
            userId,
            sessionId,
            intent: result.intent,
            confidence: result.confidence,
            action: result.action,
          });
        } else if (llmAttempt?.source === 'deterministic_fallback') {
          result = llmAttempt.result;
          classificationSource = 'llm_reasoner_fallback';
          this.logger.debug?.('[IntentIntegration] LLMReasoner fallback to IntentReasoner', {
            userId,
            sessionId,
            intent: result.intent,
          });
        } else {
          result = await this.reasoner.reason(userId, sessionId, reasonerInput);
        }
      }

      const durationMs = Date.now() - startTime;

      this.logger.debug?.('[IntentIntegration] IntentReasoner completed', {
        userId,
        sessionId,
        intent: result.intent,
        confidence: result.confidence,
        action: result.action,
        durationMs,
        classificationSource,
      });

      this._track('intent_reasoning.completed', {
        userId,
        sessionId,
        intent: result.intent,
        confidence: result.confidence,
        action: result.action,
        durationMs,
        requiresClarification: result.requiresClarification,
        isGuest: result.userState?.isGuest || false,
        version: INTENT_REASONER_VERSION,
        classificationSource,
      });

      return {
        ...this._transformToClassification(result),
        _reasoningResult: result,
        _classificationSource: classificationSource,
      };
    } catch (error) {
      diagLog(diag, '❌ processIntake error:', error?.message ?? String(error));
      this.logger.error?.('[IntentIntegration] IntentReasoner failed', {
        userId,
        sessionId,
        error: error.message,
        stack: error.stack,
      });

      this._track('intent_reasoning.error', {
        userId,
        sessionId,
        error: error.message,
      });

      throw new Error(`IntentReasoner failed: ${error.message}`);
    }
  }

  /**
   * @param {import('./intentTypes.js').IntentReasoningResult} result
   * @returns {Record<string, unknown>}
   */
  _transformToClassification(result) {
    const base = {
      confidence: result.confidence,
      parameters:
        result.parameters && typeof result.parameters === 'object' && !Array.isArray(result.parameters)
          ? { ...result.parameters }
          : {},
      _reasoning: {
        intent: result.intent,
        confidence: result.confidence,
        reasoning: result.reasoning,
        action: result.action,
        trace: result.trace,
      },
      _classificationSource: 'intent_reasoner', // overridden when LLM path runs
    };

    if (result.requiresClarification || result.action === 'ask_clarification') {
      const clarifyTool =
        result.intent === 'add_product' ? 'replace_store_catalog' : 'general_chat';
      const entry = getToolEntry(clarifyTool);
      return {
        ...base,
        executionPath: 'clarify',
        tool: clarifyTool,
        message: result.clarificationPrompt || 'What would you like to do?',
        clarifyOptions: this._formatClarifyOptions(result.suggestedActions, result.parameters),
        ...(entry?.executionPath && result.intent !== 'add_product'
          ? { _suggestedExecutionPath: entry.executionPath }
          : {}),
      };
    }

    if (result.action === 'guide_to_sign_in') {
      const tool = this._intentToTool(result.intent, result.parameters);
      const entry = getToolEntry(tool);
      return {
        ...base,
        executionPath: entry?.executionPath ?? 'proactive_plan',
        tool,
        parameters: {
          ...base.parameters,
          ...(result.userState?.draftId && !base.parameters.draftId
            ? { draftId: result.userState.draftId }
            : {}),
          ...(result.userState?.storeId && !base.parameters.storeId
            ? { storeId: result.userState.storeId }
            : {}),
        },
        _requiresSignIn: true,
      };
    }

    if (result.tool) {
      const entry = getToolEntry(result.tool);
      return {
        ...base,
        executionPath: entry?.executionPath ?? 'proactive_plan',
        tool: result.tool,
      };
    }

    if (result.action === 'start_new_workflow') {
      const tool = result.intent === 'create_store_first' ? 'create_store' : 'create_store';
      const entry = getToolEntry(tool);
      return {
        ...base,
        executionPath: entry?.executionPath ?? 'direct_action',
        tool,
        message: result.reasoning?.[0] || 'I can help you get started',
        clarifyOptions: this._formatClarifyOptions(result.suggestedActions),
      };
    }

    if (result.action === 'show_help') {
      return {
        ...base,
        executionPath: 'chat',
        tool: 'general_chat',
        message: result.clarificationPrompt || result.reasoning?.[0] || 'How can I help?',
        clarifyOptions: this._formatClarifyOptions(result.suggestedActions),
      };
    }

    return {
      ...base,
      executionPath: 'chat',
      tool: 'general_chat',
      message: result.reasoning?.[0] || 'How can I help?',
      clarifyOptions: this._formatClarifyOptions(result.suggestedActions),
    };
  }

  /**
   * @param {string} intent
   * @param {Record<string, unknown>} [parameters]
   */
  _intentToTool(intent, parameters = {}) {
    if (parameters?.tool && typeof parameters.tool === 'string') return parameters.tool;

    const map = {
      add_product: 'replace_store_catalog',
      create_campaign: 'create_campaign',
      publish_store: 'publish_store',
      create_store: 'create_store',
      upload_asset: 'upload_store_asset',
      generate_graphic: 'create_promotion_graphic',
      setup_loyalty: 'setup_loyalty_program',
      view_analytics: 'get_store_analytics',
      analyze_asset: 'ingest_asset_for_intent_detection',
      guide_to_sign_in: 'replace_store_catalog',
    };

    return map[intent] || 'general_chat';
  }

  /**
   * @param {import('./intentTypes.js').SuggestedAction[] | undefined} actions
   * @param {Record<string, unknown>} [defaultParams]
   */
  _formatClarifyOptions(actions, defaultParams = {}) {
    if (!actions?.length) return [];

    return actions.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      tool:
        action.tool ||
        (action.action === 'guide_to_sign_in'
          ? 'replace_store_catalog'
          : action.action === 'start_new_workflow'
            ? 'create_store'
            : 'general_chat'),
      parameters: {
        ...defaultParams,
        ...(action.parameters && typeof action.parameters === 'object' ? action.parameters : {}),
      },
      priority: action.priority || 0,
    }));
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
      this.logger.debug?.(`[IntentIntegration] ${event}`, props);
    }
  }
}

export default IntentIntegration;

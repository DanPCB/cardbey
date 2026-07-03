/**
 * ============================================================
 * PHASE B.2 — INTENT REASONING ENGINE
 * ============================================================
 *
 * Core reasoning engine that replaces classification-based intake
 * with context-aware intent reasoning.
 */

import { DEFAULT_REASONER_CONFIG, INTENT_REASONER_VERSION } from './constants.js';
import {
  pickMemorySummary,
  pickUnifiedMemory,
  resolveIntakeDraftId,
  resolveIntakeMissionId,
  resolveIntakeStoreId,
} from '../intake/intakeMemoryContext.js';
import { createConfidenceFactor, createReasoningResult } from './utils.js';
import { isVagueAddProductMessage } from '../intake/guestDraftProductClarify.js';
import { PERFORMER_INTAKE_MESSAGES } from '../intake/performerIntakeMessageCatalog.js';
import { shouldRouteToAssetIntentDetection, detectCreateStoreFromUploadedAssetIntent, hasExplicitUploadCreateStoreOrWebsiteIntent, hasRecentUploadedAssetInContext } from '../intake/assetUploadGuard.js';
import { isCasualChatTurn } from '../intake/intakeCasualChatTurn.js';
import { buildAssetIntentDetectionClassification, buildAnalyzeUploadedAssetForStoreCreationClassification } from '../intake/assetIntentIngestService.js';
import {
  buildDocumentIngestionClassification,
  detectDocumentIngestionIntent,
} from '../intent/documentIngestIntent.js';
import { detectPromotionGraphicIntent } from '../intake/intakeSystemShortcuts.js';
import { isLoyaltyIntent } from '../intake/intentDetectors.js';
import { tryStoreCreateFastPath } from './storeCreateFastPath.js';
import { isDecisionLoopEnabled } from '../../config/features.js';
import { parseNaturalLanguageStoreCreation } from '../intake/storeCreationDraft.js';
import { LearningIntegration, isLearningLayerEnabled } from '../learning/learningIntegration.js';

/**
 * Intent Reasoning Engine.
 *
 * @example
 * const reasoner = new IntentReasoner({ contextProvider, config });
 * const result = await reasoner.reason(userId, sessionId, input);
 */
export class IntentReasoner {
  /**
   * @param {Object} options
   * @param {import('../context/contextProvider.js').ContextProvider} options.contextProvider
   * @param {Object} [options.toolRegistry]
   * @param {Object|null} [options.guestGate]
   * @param {Console} [options.logger]
   * @param {Partial<import('./intentTypes.js').IntentReasonerConfig>} [options.config]
   */
  constructor({
    contextProvider,
    toolRegistry = {},
    guestGate = null,
    logger = console,
    config = {},
  }) {
    this.contextProvider = contextProvider;
    this.toolRegistry = toolRegistry;
    this.guestGate = guestGate;
    this.logger = logger;
    this.config = { ...DEFAULT_REASONER_CONFIG, ...config };
    this.learningEnabled = this.config.learningEnabled !== false && isLearningLayerEnabled();

    if (this.learningEnabled) {
      this.learning = new LearningIntegration({ contextProvider, reasoner: this });
    }
  }

  /**
   * @param {string} userId
   * @param {string} sessionId
   * @param {Object} input
   * @param {string} [input.text]
   * @param {Array} [input.attachments]
   * @param {string} [input.imageDataUrl]
   * @param {string} [input.extractedText]
   * @param {boolean} [input.hasAttachment]
   * @param {Object} [options]
   * @returns {Promise<import('./intentTypes.js').IntentReasoningResult>}
   */
  async reason(userId, sessionId, input, options = {}) {
    const startTime = Date.now();
    const reasoningId = this._generateReasoningId();

    this.logger.debug?.('[IntentReasoner] Starting reasoning', {
      userId,
      sessionId,
      input: input.text?.slice(0, 100),
      hasAttachment: !!(input.attachments?.length || input.imageDataUrl || input.hasAttachment),
    });

    try {
      let context = await this.contextProvider.getContext(userId, sessionId);
      if (!context) {
        return this._fallbackResult(input, reasoningId, startTime);
      }

      if (this.learningEnabled && this.learning) {
        const enhanced = await this.learning.enhanceReasoning(userId, sessionId, input, context);
        context = {
          ...context,
          ...enhanced,
          preferences: {
            ...(context.preferences && typeof context.preferences === 'object' ? context.preferences : {}),
            ...(enhanced.preferences && typeof enhanced.preferences === 'object' ? enhanced.preferences : {}),
          },
        };
      }

      const parsedInput = this._parseInput(input);
      const userState = this._evaluateState(context, parsedInput, userId);
      const goal = this._inferGoal(context, parsedInput, userState);
      const action = this._determineAction(context, parsedInput, userState, goal);
      const trace = this._buildTrace(reasoningId, startTime, userState, goal, action);

      const result = this._buildResult({
        goal,
        action,
        userState,
        parsedInput,
        trace,
        reasoningId,
        startTime,
        userId,
        sessionId,
        context,
      });

      if (this.learningEnabled && this.learning && result && result.intent !== 'general_chat') {
        const learning = this.learning;
        const provider = this.contextProvider;
        setTimeout(() => {
          provider
            .recordInteraction?.(
              userId,
              sessionId,
              input,
              result,
              result.intent,
              result.confidence,
              result.metadata?.reasoningTimeMs ?? 0,
            )
            .catch(() => {});
          learning.analysis.analyzeUser(userId, sessionId).catch(() => {});
        }, 0);
      }

      this.logger.debug?.('[IntentReasoner] Reasoning complete', {
        userId,
        sessionId,
        intent: result.intent,
        confidence: result.confidence,
        action: result.action,
        requiresClarification: result.requiresClarification,
        reasoningTimeMs: result.metadata.reasoningTimeMs,
      });

      return result;
    } catch (error) {
      this.logger.error?.('[IntentReasoner] Reasoning failed', {
        userId,
        sessionId,
        error: error.message,
        stack: error.stack,
      });

      return this._errorResult(input, reasoningId, startTime, error);
    }
  }

  /**
   * Process feedback on a reasoning result.
   */
  async processFeedback(userId, sessionId, result, feedbackType) {
    if (!this.learningEnabled || !this.learning) return null;
    return this.learning.processFeedback(userId, sessionId, result, feedbackType);
  }

  /**
   * Process a correction.
   */
  async processCorrection(userId, sessionId, originalIntent, correctedIntent, context) {
    if (!this.learningEnabled || !this.learning) return null;
    return this.learning.processCorrection(
      userId,
      sessionId,
      originalIntent,
      correctedIntent,
      context,
    );
  }

  /**
   * @param {Object} input
   * @returns {import('./intentTypes.js').ParsedInput}
   */
  _parseInput(input) {
    const rawText = input.text || '';
    const normalizedText = rawText.toLowerCase().trim();
    const hasAttachment = !!(
      input.hasAttachment ||
      input.attachments?.length ||
      input.imageDataUrl
    );
    const hasImage = !!input.imageDataUrl;

    const attachments = (input.attachments || []).map((a) => ({
      id: a.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: a.name || 'attachment',
      mimeType: a.mimeType || 'application/octet-stream',
      size: a.size,
      url: a.url,
      base64: a.base64,
      dataUrl: a.dataUrl ?? a.uri ?? a.imageDataUrl,
      uri: a.uri,
      data: a.data,
      metadata: a.metadata || {},
    }));

    const entities = this._extractEntities(rawText);

    const storeCreateForm =
      input.storeCreateForm && typeof input.storeCreateForm === 'object' && !Array.isArray(input.storeCreateForm)
        ? input.storeCreateForm
        : null;
    const primaryModeHint =
      typeof input.primaryModeHint === 'string' && input.primaryModeHint.trim()
        ? input.primaryModeHint.trim()
        : null;
    const action =
      typeof input.action === 'string' && input.action.trim() ? input.action.trim() : null;
    const parameters =
      input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
        ? input.parameters
        : {};
    const memorySummary =
      input.memorySummary && typeof input.memorySummary === 'object' && !Array.isArray(input.memorySummary)
        ? input.memorySummary
        : null;
    const unifiedMemory =
      input.unifiedMemory && typeof input.unifiedMemory === 'object' && !Array.isArray(input.unifiedMemory)
        ? input.unifiedMemory
        : null;
    const currentContext =
      input.currentContext && typeof input.currentContext === 'object' && !Array.isArray(input.currentContext)
        ? input.currentContext
        : null;

    return {
      rawText,
      normalizedText,
      hasAttachment,
      hasImage,
      extractedText: input.extractedText || null,
      attachments,
      entities,
      storeCreateForm,
      primaryModeHint,
      action,
      parameters,
      language: this._detectLanguage(rawText),
      sourceType: this._detectSourceType(input),
      intakeMeta: {
        originalUserMessage: input.originalUserMessage ?? null,
        storeCreateForm,
        primaryModeHint,
        action,
        parameters,
        forceIntent: input.forceIntent ?? null,
        currentFlow: input.currentFlow ?? null,
        source: input.source ?? null,
        imageDataUrl: input.imageDataUrl ?? null,
        shortcutContext: input.shortcutContext ?? null,
        memorySummary,
        unifiedMemory,
        currentContext,
      },
    };
  }

  /**
   * Merge persisted session context with intake POST surface context + memory payloads.
   *
   * @param {import('../context/contextTypes.js').UserContext} context
   * @param {import('./intentTypes.js').ParsedInput} parsedInput
   */
  _resolveEffectiveIds(context, parsedInput) {
    const intakeMeta = parsedInput?.intakeMeta ?? {};
    const clientCtx =
      intakeMeta.currentContext && typeof intakeMeta.currentContext === 'object'
        ? intakeMeta.currentContext
        : {};
    const memorySummary =
      intakeMeta.memorySummary && typeof intakeMeta.memorySummary === 'object'
        ? intakeMeta.memorySummary
        : pickMemorySummary(clientCtx);
    const memoryContext =
      clientCtx._memoryContext && typeof clientCtx._memoryContext === 'object'
        ? clientCtx._memoryContext
        : null;
    const storeFromMemoryContext =
      memoryContext?.hasActiveStore && memoryContext?.store?.id
        ? String(memoryContext.store.id).trim()
        : null;

    const storeId = resolveIntakeStoreId({
      activeStoreId: context.activeStoreId ?? clientCtx.activeStoreId ?? storeFromMemoryContext,
      storeId: clientCtx.storeId ?? storeFromMemoryContext,
      memorySummary: storeFromMemoryContext
        ? { ...memorySummary, storeId: storeFromMemoryContext }
        : memorySummary,
      _memoryContext: memoryContext,
    });
    const draftId = resolveIntakeDraftId({
      activeDraftId: context.activeDraftId ?? clientCtx.activeDraftId,
      draftId: clientCtx.draftId ?? clientCtx.activeDraftId,
      memorySummary,
    });
    const missionId = resolveIntakeMissionId({
      body: { missionId: clientCtx.activeMissionId },
      currentContext: {
        ...clientCtx,
        activeMissionId: context.activeMissionId ?? clientCtx.activeMissionId,
        memorySummary,
      },
    });

    return { storeId, draftId, missionId, memorySummary };
  }

  /**
   * Structured store form / primaryModeHint / explicit action → create_store (even when user already has a store).
   * @param {object} input
   * @returns {object | null}
   */
  _createStoreGoalFromFormSignals(input = {}) {
    const storeCreateForm =
      input.storeCreateForm && typeof input.storeCreateForm === 'object' && !Array.isArray(input.storeCreateForm)
        ? input.storeCreateForm
        : null;
    const parameters =
      input.parameters && typeof input.parameters === 'object' && !Array.isArray(input.parameters)
        ? input.parameters
        : {};
    const primaryModeHint = String(input.primaryModeHint ?? '').trim();
    const action = String(input.action ?? '').trim();

    const formName = String(storeCreateForm?.storeName ?? '').trim();
    const hasForm = formName.length >= 2;
    const hasHint = primaryModeHint === 'store_setup' || primaryModeHint === 'store_creation';
    const hasAction = action === 'create_store';
    const userText = String(input.text ?? input.userMessage ?? '').trim();

    if (isCasualChatTurn(userText)) return null;

    if (!hasForm && !hasHint && !hasAction) return null;

    const storeName =
      formName ||
      String(parameters.name ?? parameters.storeName ?? '').trim() ||
      'New Store';
    const storeType =
      storeCreateForm?.storeType ??
      storeCreateForm?.category ??
      parameters.category ??
      parameters.storeType;
    const location = storeCreateForm?.location ?? parameters.location;
    const intentMode = storeCreateForm?.intentMode ?? parameters.intentMode ?? 'store';
    const reason = hasForm ? 'store_create_form' : hasAction ? 'explicit_action' : 'primary_mode_hint';

    return {
      type: 'create_store',
      confidence: 1,
      description:
        reason === 'primary_mode_hint'
          ? 'Store creation from primary mode hint'
          : reason === 'explicit_action'
            ? 'Store creation from explicit action'
            : 'Store creation from structured form',
      factors: [
        reason === 'primary_mode_hint'
          ? 'primary_mode_hint_detected'
          : reason === 'explicit_action'
            ? 'explicit_action_detected'
            : 'store_create_form_detected',
      ],
      clarificationNeeded: false,
      clarificationPrompt: null,
      fastPathClassification: {
        tool: 'create_store',
        confidence: 1,
        parameters: {
          storeName,
          ...(storeType ? { storeType, category: storeType } : {}),
          ...(location ? { location: String(location).trim() } : {}),
          intentMode: intentMode === 'website' ? 'website' : 'store',
          _autoSubmit: true,
          source: reason,
        },
        _fastPath: reason,
      },
    };
  }

  /**
   * @param {string} text
   * @returns {import('./intentTypes.js').ParsedEntity[]}
   */
  _extractEntities(text) {
    const entities = [];

    const storePatterns = [
      /(?:create|set up|make|build|start|launch)\s+(?:a\s+)?(?:store|shop)\s+(?:called|named)\s+(.+?)(?:\s+and\b|$)/i,
      /store\s+(?:called|named)\s+(.+?)(?:\s+and\b|$)/i,
      /(?:my|the)\s+store\s+(.+?)(?:\s+and\b|$)/i,
    ];

    for (const pattern of storePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        entities.push({ type: 'store', value: match[1].trim(), confidence: 0.8 });
        break;
      }
    }

    const productPatterns = [
      /(?:add|create|upload)\s+(?:a\s+)?(?:product|item)\s+(?:called|named)\s+(.+?)(?:\s+and\b|$)/i,
      /product\s+(?:called|named)\s+(.+?)(?:\s+and\b|$)/i,
    ];

    for (const pattern of productPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        entities.push({ type: 'product', value: match[1].trim(), confidence: 0.8 });
        break;
      }
    }

    const campaignPatterns = [
      /(?:create|launch|start)\s+(?:a\s+)?(?:campaign|promo|promotion)\s+(?:called|named)\s+(.+?)(?:\s+and\b|$)/i,
    ];

    for (const pattern of campaignPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        entities.push({ type: 'campaign', value: match[1].trim(), confidence: 0.8 });
        break;
      }
    }

    return entities;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  _detectLanguage(text) {
    const vietnamesePatterns = [
      /[ăâêôơưđ]/i,
      /[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/,
    ];

    for (const pattern of vietnamesePatterns) {
      if (pattern.test(text)) return 'vi';
    }

    return 'en';
  }

  /**
   * @param {Object} input
   * @returns {import('./intentTypes.js').ParsedInputSourceType}
   */
  _detectSourceType(input) {
    if (input.imageDataUrl || input.attachments?.some((a) => a.mimeType?.startsWith('image/'))) {
      return 'image';
    }
    if (input.attachments?.length) return 'file';
    if (input.audio) return 'voice';
    return 'text';
  }

  /**
   * @param {import('../context/contextTypes.js').UserContext} context
   * @param {import('./intentTypes.js').ParsedInput} parsedInput
   * @param {string} userId
   * @returns {import('./intentTypes.js').UserState}
   */
  _evaluateState(context, parsedInput, userId) {
    const isGuest = userId?.startsWith('guest_');
    const { storeId: activeStoreId, draftId: activeDraftId, missionId: activeMissionId, memorySummary } =
      this._resolveEffectiveIds(context, parsedInput);
    const intakeMeta = parsedInput.intakeMeta ?? {};
    const unifiedMemory =
      intakeMeta.unifiedMemory && typeof intakeMeta.unifiedMemory === 'object'
        ? intakeMeta.unifiedMemory
        : null;

    const hasDraftStore = !!activeDraftId;
    const hasPermanentStore = !!activeStoreId;
    const hasStore = hasPermanentStore || hasDraftStore;
    const workflowType =
      context.currentWorkflow ||
      (typeof memorySummary.missionType === 'string' && memorySummary.missionType.trim()
        ? memorySummary.missionType.trim()
        : null) ||
      (typeof unifiedMemory?.missionType === 'string' && unifiedMemory.missionType.trim()
        ? unifiedMemory.missionType.trim()
        : null);
    const blockers = [];

    if (workflowType !== 'store_creation' && !hasStore) {
      blockers.push({
        type: 'no_store',
        description: 'You need a store to perform this action',
        resolution: 'Create a store first',
        resolutionAction: 'start_new_workflow',
      });
    }

    return {
      hasStore,
      storeId: activeStoreId,
      draftId: activeDraftId,
      isGuest,
      hasDraftStore,
      hasPermanentStore,
      isInWorkflow: !!workflowType,
      workflowType,
      missionId: activeMissionId,
      recentInteractions: (context.interactions || [])
        .slice(0, 5)
        .map((i) => i.type || 'unknown'),
      inferredGoal:
        this._inferGoalFromHistory(context) ||
        (typeof unifiedMemory?.activeSummary === 'string' && unifiedMemory.activeSummary.trim()
          ? unifiedMemory.activeSummary.trim()
          : null) ||
        (typeof memorySummary.missionType === 'string' && memorySummary.missionType.trim()
          ? memorySummary.missionType.trim()
          : null),
      constraints: {
        isGuest,
        canPerformAction: blockers.length === 0,
        blockers,
      },
      description: this._buildStateDescription({
        isGuest,
        hasStore,
        hasDraftStore,
        hasPermanentStore,
        workflowType,
        blockers,
      }),
    };
  }

  /**
   * @param {import('../context/contextTypes.js').UserContext} context
   * @returns {string | null}
   */
  _inferGoalFromHistory(context) {
    const interactions = context.interactions || [];
    if (interactions.length === 0) return null;

    const intents = interactions
      .slice(0, 3)
      .map((i) => i.intent)
      .filter(Boolean);

    return intents[0] || null;
  }

  /**
   * @param {Object} state
   * @returns {string}
   */
  _buildStateDescription({ isGuest, hasStore, hasDraftStore, hasPermanentStore, workflowType, blockers }) {
    const parts = [];

    if (isGuest) parts.push('Guest user');
    if (hasPermanentStore) parts.push('has permanent store');
    else if (hasDraftStore) parts.push('has draft store (guest)');
    else if (hasStore) parts.push('has store');
    else parts.push('no store yet');

    if (workflowType) parts.push(`in ${workflowType} workflow`);
    if (blockers.length > 0) parts.push(`blocked by: ${blockers.map((b) => b.type).join(', ')}`);

    return parts.join(' · ') || 'Unknown state';
  }

  /**
   * @param {import('../context/contextTypes.js').UserContext} context
   * @param {import('./intentTypes.js').ParsedInput} parsedInput
   * @param {import('./intentTypes.js').UserState} userState
   */
  _inferGoal(context, parsedInput, userState) {
    const text = parsedInput.normalizedText;
    const rawText = parsedInput.rawText;
    const candidates = [];

    const formDrivenGoal = this._createStoreGoalFromFormSignals({
      text: rawText,
      userMessage: rawText,
      storeCreateForm: parsedInput.storeCreateForm ?? parsedInput.intakeMeta?.storeCreateForm,
      parameters: parsedInput.parameters ?? parsedInput.intakeMeta?.parameters,
      primaryModeHint: parsedInput.primaryModeHint ?? parsedInput.intakeMeta?.primaryModeHint,
      action: parsedInput.action ?? parsedInput.intakeMeta?.action,
    });
    if (formDrivenGoal) {
      return formDrivenGoal;
    }

    const { storeId } = this._resolveEffectiveIds(context, parsedInput);

    const guardMessage = String(
      parsedInput.intakeMeta?.originalUserMessage ?? rawText ?? '',
    ).trim();
    const fastPathCtx = {
      attachments: parsedInput.attachments,
      imageDataUrl: parsedInput.intakeMeta?.imageDataUrl ?? parsedInput.imageDataUrl ?? null,
      storeId,
      storeContext: storeId ? { storeId } : undefined,
      intentSourceContext:
        parsedInput.intakeMeta?.intentSourceContext && typeof parsedInput.intakeMeta.intentSourceContext === 'object'
          ? parsedInput.intakeMeta.intentSourceContext
          : null,
      sessionId:
        typeof parsedInput.intakeMeta?.sessionId === 'string' ? parsedInput.intakeMeta.sessionId.trim() : null,
      hasSessionPendingExtraction: Boolean(parsedInput.intakeMeta?.hasSessionPendingExtraction),
    };

    const attachmentOnlyUpload =
      (parsedInput.hasAttachment || parsedInput.hasImage) &&
      shouldRouteToAssetIntentDetection(guardMessage, fastPathCtx);

    const shortcutContext = parsedInput.intakeMeta?.shortcutContext;

    // ---- Phase 2: reasoner fast-paths ----

    if (shortcutContext?.type === 'create_store' && !attachmentOnlyUpload) {
      const intentMode = shortcutContext.intentMode === 'website' ? 'website' : 'store';
      candidates.push({
        type: 'create_store',
        confidence: 0.98,
        description: 'Create store shortcut context',
        factors: ['shortcut_context'],
        fastPathClassification: {
          tool: 'create_store',
          parameters: {
            intentMode,
            ...(shortcutContext.intentLabel ? { intentLabel: shortcutContext.intentLabel } : {}),
            source: 'shortcut_context',
          },
          _fastPath: 'create_store_shortcut',
        },
      });
    }

    if (!attachmentOnlyUpload && shortcutContext?.type !== 'create_store' && !isDecisionLoopEnabled()) {
      const storeFast = tryStoreCreateFastPath(rawText, {
        storeCreateForm: parsedInput.intakeMeta?.storeCreateForm,
        forceIntent: parsedInput.intakeMeta?.forceIntent,
        currentFlow: parsedInput.intakeMeta?.currentFlow,
        source: parsedInput.intakeMeta?.source,
        activeStoreId: storeId ?? context.activeStoreId,
      });
      if (storeFast) {
        candidates.push({
          type: 'create_store',
          confidence: storeFast.confidence ?? 0.95,
          description: 'User wants to create a store (fast path)',
          factors: ['store_creation_fast_path'],
          fastPathClassification: storeFast,
        });
      }
    }

    if (storeId) {
      const promoGraphicIntent = detectPromotionGraphicIntent(rawText, storeId);
      if (promoGraphicIntent) {
        candidates.push({
          type: 'generate_graphic',
          confidence: promoGraphicIntent.confidence ?? 0.95,
          description: 'User wants to create a promotion graphic',
          factors: ['promotion_graphic_fast_path'],
          fastPathClassification: {
            tool: 'create_promotion_graphic',
            parameters: promoGraphicIntent.params ?? { storeId },
            _fastPath: 'promotion_graphic',
          },
        });
      }
    }

    if (storeId && isLoyaltyIntent(rawText)) {
      candidates.push({
        type: 'setup_loyalty',
        confidence: 0.93,
        description: 'User wants to set up a loyalty program',
        factors: ['loyalty_fast_path'],
        fastPathClassification: {
          tool: 'setup_loyalty_program',
          parameters: { storeId },
          _fastPath: 'loyalty',
        },
      });
    }

    if (
      shouldRouteToAssetIntentDetection(guardMessage, fastPathCtx) &&
      (attachmentOnlyUpload ||
        (userState.workflowType !== 'store_creation' && userState.workflowType !== 'campaign_creation'))
    ) {
      const assetCls = buildAssetIntentDetectionClassification(guardMessage, fastPathCtx);
      candidates.push({
        type: 'analyze_asset',
        confidence: assetCls.confidence ?? 0.92,
        description: 'User uploaded an asset for intent detection',
        factors: ['asset_intent_detection_fast_path'],
        fastPathClassification: assetCls,
      });
    }

    const docIntent = detectDocumentIngestionIntent(rawText, fastPathCtx);
    if (docIntent) {
      const docCls = buildDocumentIngestionClassification(rawText, fastPathCtx);
      candidates.push({
        type: 'analyze_asset',
        confidence: docCls.confidence ?? 0.95,
        description: 'User wants to ingest or analyze a document',
        factors: ['document_ingest_fast_path'],
        fastPathClassification: docCls,
      });
    }

    if (storeId && this._detectAnalyticsIntent(rawText)) {
      candidates.push({
        type: 'view_analytics',
        confidence: 0.85,
        description: 'User wants to view store analytics',
        factors: ['analytics_fast_path'],
        fastPathClassification: {
          tool: 'get_store_analytics',
          parameters: { storeId },
          _fastPath: 'analytics',
        },
      });
    }

    if (
      hasExplicitUploadCreateStoreOrWebsiteIntent(rawText) &&
      hasRecentUploadedAssetInContext({
        attachments: parsedInput.attachments,
        imageDataUrl: parsedInput.imageDataUrl,
        intentSourceContext: fastPathCtx.intentSourceContext,
        sessionId: fastPathCtx.sessionId,
        hasSessionPendingExtraction: fastPathCtx.hasSessionPendingExtraction,
      })
    ) {
      const uploadStoreCls = buildAnalyzeUploadedAssetForStoreCreationClassification(rawText, fastPathCtx);
      candidates.push({
        type: 'analyze_asset',
        confidence: 0.98,
        description: 'User wants to create a store from an uploaded business card or document',
        factors: ['uploaded_asset_store_creation_fast_path'],
        fastPathClassification: uploadStoreCls,
      });
    }

    if (
      !attachmentOnlyUpload &&
      this._matchPatterns(text, [
        /create\s+(?:a\s+)?store/i,
        /create\s+store:/i,
        /set\s+up\s+(?:a\s+)?store/i,
        /make\s+(?:a\s+)?store/i,
        /build\s+(?:a\s+)?store/i,
        /start\s+(?:a\s+)?store/i,
        /new\s+store/i,
        /open\s+(?:a\s+)?store/i,
        /launch\s+(?:a\s+)?store/i,
        /store\s+creation/i,
      ])
    ) {
      candidates.push({
        type: 'create_store',
        confidence: 0.95,
        description: 'User wants to create a new store',
        factors: ['explicit_store_creation_phrases'],
      });
    }

    if (
      storeId &&
      this._matchPatterns(text, [
        /publish\s+(?:my\s+)?store/i,
        /go\s+live\s+(?:with\s+(?:my\s+)?store)?/i,
        /launch\s+(?:my\s+)?store/i,
        /make\s+(?:my\s+)?store\s+live/i,
        /push\s+(?:my\s+)?store\s+live/i,
        /deploy\s+(?:my\s+)?store/i,
      ])
    ) {
      candidates.push({
        type: 'publish_store',
        confidence: 0.88,
        description: 'User wants to publish their store',
        factors: ['publish_fast_path'],
      });
    } else if (
      this._matchPatterns(text, [
        /publish\s+(?:my\s+)?store/i,
        /go\s+live\s+with\s+(?:my\s+)?store/i,
        /launch\s+(?:my\s+)?store/i,
      ])
    ) {
      candidates.push({
        type: 'publish_store',
        confidence: 0.85,
        description: 'User wants to publish their store',
        factors: ['explicit_publish_phrases'],
      });
    }

    if (
      this._matchPatterns(text, [
        /add\s+(?:a\s+)?product/i,
        /add\s+(?:a\s+)?item/i,
        /add\s+(?:a\s+)?menu/i,
        /upload\s+(?:a\s+)?product/i,
        /create\s+(?:a\s+)?product/i,
        /new\s+product/i,
      ])
    ) {
      if (userState.hasStore) {
        candidates.push({
          type: 'add_product',
          confidence: 0.92,
          description: 'User wants to add a product to an existing store',
          factors: ['explicit_product_phrases', 'has_store'],
        });
      } else {
        candidates.push({
          type: 'add_product',
          confidence: 0.6,
          description: 'User wants to add a product but has no store yet',
          factors: ['explicit_product_phrases', 'no_store'],
        });
        candidates.push({
          type: 'create_store_first',
          confidence: 0.7,
          description: 'User needs a store before adding products',
          factors: ['needs_store_for_product'],
        });
      }
    }

    if (
      this._matchPatterns(text, [
        /create\s+(?:a\s+)?campaign/i,
        /launch\s+(?:a\s+)?campaign/i,
        /start\s+(?:a\s+)?campaign/i,
        /new\s+campaign/i,
        /promo\s+campaign/i,
        /marketing\s+campaign/i,
      ])
    ) {
      if (userState.hasStore) {
        candidates.push({
          type: 'create_campaign',
          confidence: 0.88,
          description: 'User wants to create a campaign for their store',
          factors: ['explicit_campaign_phrases', 'has_store'],
        });
      } else {
        candidates.push({
          type: 'create_campaign',
          confidence: 0.5,
          description: 'User wants a campaign but needs a store first',
          factors: ['explicit_campaign_phrases', 'no_store'],
        });
        candidates.push({
          type: 'create_store_first',
          confidence: 0.6,
          description: 'User needs a store before creating campaigns',
          factors: ['needs_store_for_campaign'],
        });
      }
    }

    if (parsedInput.hasAttachment || parsedInput.hasImage) {
      const routedToAssetIngest = candidates.some(
        (c) => c.fastPathClassification?.tool === 'ingest_asset_for_intent_detection',
      );
      if (!routedToAssetIngest) {
      if (userState.isInWorkflow && userState.workflowType === 'store_creation') {
        candidates.push({
          type: 'upload_asset',
          confidence: 0.85,
          description: 'User is uploading an asset during store creation',
          factors: ['has_attachment', 'in_store_workflow'],
        });
        candidates.push({
          type: 'update_store',
          confidence: 0.7,
          description: 'User may want to use this asset for their store',
          factors: ['has_attachment', 'has_store'],
        });
      } else if (userState.isInWorkflow && userState.workflowType === 'campaign_creation') {
        candidates.push({
          type: 'upload_asset',
          confidence: 0.85,
          description: 'User is uploading an asset during campaign creation',
          factors: ['has_attachment', 'in_campaign_workflow'],
        });
      } else if (userState.hasStore) {
        candidates.push({
          type: 'upload_asset',
          confidence: 0.7,
          description: 'User uploaded an asset to their store',
          factors: ['has_attachment', 'has_store'],
        });
      } else {
        candidates.push({
          type: 'analyze_asset',
          confidence: 0.65,
          description: 'User uploaded an asset to analyze',
          factors: ['has_attachment', 'no_store'],
        });
      }
      }
    }

    candidates.push({
      type: 'general_chat',
      confidence: 0.3,
      description: 'General conversation',
      factors: ['no_specific_intent_detected'],
    });

    candidates.sort((a, b) => b.confidence - a.confidence);
    const top = candidates[0];

    if (top.confidence < this.config.minClarificationThreshold) {
      return {
        type: 'clarification',
        confidence: top.confidence,
        description: 'Intent unclear, asking for clarification',
        factors: top.factors || ['low_confidence'],
        clarificationNeeded: true,
        clarificationPrompt: this._generateClarificationPrompt(parsedInput, userState),
      };
    }

    return {
      type: top.type,
      confidence: top.confidence,
      description: top.description,
      factors: top.factors || [],
      clarificationNeeded: false,
      clarificationPrompt: null,
      fastPathClassification: top.fastPathClassification ?? null,
    };
  }

  /**
   * Ported analytics patterns (LLM prompt / intakeIntentOntology parity).
   * @param {string} text
   */
  _detectAnalyticsIntent(text) {
    return this._matchPatterns(text, [
      /\banalytics\b/i,
      /\bsales\s+report\b/i,
      /\brevenue\b/i,
      /\bperformance\b/i,
      /\bstatistics\b/i,
      /\bmetrics\b/i,
      /\binsights\b/i,
      /\bhow\s+(?:is|are)\s+(?:my\s+)?(?:store|business|sales)\b/i,
      /\bwhat(?:'s| is| are)\s+(?:my\s+)?(?:revenue|sales|performance)\b/i,
      /\bshow\s+(?:me\s+)?(?:analytics|sales|revenue)\b/i,
      /\b(report|reports|orders|kpi|metric)\b/i,
    ]);
  }

  /**
   * @param {string} text
   * @param {RegExp[]} patterns
   */
  _matchPatterns(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * @param {import('./intentTypes.js').ParsedInput} parsedInput
   * @param {import('./intentTypes.js').UserState} userState
   */
  _generateClarificationPrompt(parsedInput, userState) {
    if (parsedInput.hasAttachment || parsedInput.hasImage) {
      return 'What would you like to do with this file?';
    }
    if (!userState.hasStore) {
      return 'Would you like to create a store or do something else?';
    }
    return "I want to understand what you'd like to do. Could you rephrase that?";
  }

  /**
   * @param {import('../context/contextTypes.js').UserContext} context
   * @param {import('./intentTypes.js').ParsedInput} parsedInput
   * @param {import('./intentTypes.js').UserState} userState
   * @param {Object} goal
   */
  _determineAction(context, parsedInput, userState, goal) {
    const isGuest = userState.isGuest;
    const hasStore = userState.hasStore;
    const hasDraft = userState.hasDraftStore;
    const hasPermanentStore = userState.hasPermanentStore;
    const lang = parsedInput.language === 'vi' ? 'vi' : 'en';

    /** @type {Object} */
    let action = {
      type: 'execute_tool',
      intent: goal.type,
      confidence: goal.confidence,
      tool: null,
      parameters: {},
      suggestedActions: [],
      confidenceFactors: [],
    };

    if (isGuest && hasDraft && goal.type === 'add_product') {
      if (
        isVagueAddProductMessage(parsedInput.rawText, {
          hasAttachment: parsedInput.hasAttachment,
        })
      ) {
        return {
          type: 'ask_clarification',
          intent: 'add_product',
          confidence: goal.confidence,
          tool: null,
          clarificationPrompt: PERFORMER_INTAKE_MESSAGES.guestDraftAddProductClarify[lang],
          suggestedActions: [
            {
              id: 'add_product_catalog',
              label: PERFORMER_INTAKE_MESSAGES.guestDraftAddProductCatalogOption[lang],
              description: 'Add a product to your draft store catalog',
              action: 'guide_to_sign_in',
              priority: 1,
            },
            {
              id: 'something_else',
              label: PERFORMER_INTAKE_MESSAGES.guestDraftAddProductSomethingElse[lang],
              description: 'Choose a different action',
              action: 'continue_workflow',
              priority: 2,
            },
          ],
          confidenceFactors: [
            createConfidenceFactor('guest_draft', 0.3, 'Guest with draft store', 'context'),
            createConfidenceFactor('vague_product', 0.3, 'Product details missing', 'input'),
          ],
        };
      }

      return {
        type: 'guide_to_sign_in',
        intent: 'guide_to_sign_in',
        confidence: goal.confidence,
        tool: null,
        suggestedActions: [
          {
            id: 'sign_in',
            label: 'Sign in to add products',
            description: 'Save your store and add products',
            action: 'guide_to_sign_in',
            priority: 1,
          },
          {
            id: 'continue_guest',
            label: 'Continue as guest (read-only)',
            description: 'Keep previewing your store',
            action: 'continue_workflow',
            priority: 2,
          },
        ],
        confidenceFactors: [
          createConfidenceFactor('guest_draft', 0.4, 'Guest user with draft store', 'context'),
          createConfidenceFactor('requires_store_action', 0.3, 'Action requires storeId', 'rules'),
        ],
      };
    }

    if (isGuest && hasDraft && goal.type === 'create_campaign') {
      return {
        type: 'guide_to_sign_in',
        intent: 'guide_to_sign_in',
        confidence: goal.confidence,
        tool: null,
        suggestedActions: [
          {
            id: 'sign_in',
            label: 'Sign in to create campaigns',
            description: 'Save your store and launch campaigns',
            action: 'guide_to_sign_in',
            priority: 1,
          },
          {
            id: 'continue_guest',
            label: 'Continue as guest (read-only)',
            description: 'Keep previewing your store',
            action: 'continue_workflow',
            priority: 2,
          },
        ],
        confidenceFactors: [
          createConfidenceFactor('guest_draft', 0.4, 'Guest user with draft store', 'context'),
          createConfidenceFactor('requires_store_action', 0.3, 'Campaign requires storeId', 'rules'),
        ],
      };
    }

    if (goal.fastPathClassification?.tool) {
      const fp = goal.fastPathClassification;
      action.tool = fp.tool;
      action.parameters =
        fp.parameters && typeof fp.parameters === 'object' && !Array.isArray(fp.parameters)
          ? { ...fp.parameters }
          : {};
      action.type = 'execute_tool';
      action.intent = goal.type;
      action.confidenceFactors = [
        createConfidenceFactor(
          fp._fastPath || 'legacy_fast_path',
          0.35,
          `Legacy fast path: ${fp._fastPath || fp.tool}`,
          'rules',
        ),
      ];
      return action;
    }

    switch (goal.type) {
      case 'create_store': {
        const nlParsed = parseNaturalLanguageStoreCreation(parsedInput.rawText ?? '');
        action.tool = 'create_store';
        action.parameters = {
          storeName:
            nlParsed.name ||
            parsedInput.entities?.find((e) => e.type === 'store')?.value ||
            null,
          ...(nlParsed.location ? { location: nlParsed.location } : {}),
          ...(nlParsed.category && nlParsed.category !== 'Other'
            ? { storeType: nlParsed.category, category: nlParsed.category }
            : {}),
          source: 'intent_reasoning',
        };
        action.confidenceFactors = [
          createConfidenceFactor('explicit_intent', 0.3, 'User explicitly wants to create a store', 'input'),
        ];
        break;
      }

      case 'publish_store':
        if (hasPermanentStore) {
          action.tool = 'publish_store';
          action.parameters = { storeId: context.activeStoreId };
        } else if (hasDraft) {
          action.type = 'guide_to_sign_in';
          action.intent = 'guide_to_sign_in';
          action.suggestedActions = [
            {
              id: 'sign_in',
              label: 'Sign in to publish',
              description: 'Save your store and publish it',
              action: 'guide_to_sign_in',
              priority: 1,
            },
          ];
        } else {
          action.type = 'start_new_workflow';
          action.intent = 'create_store_first';
          action.suggestedActions = [
            {
              id: 'create_store',
              label: 'Create a store first',
              description: 'Start your store',
              action: 'start_new_workflow',
              priority: 1,
            },
          ];
        }
        break;

      case 'add_product':
        if (hasStore) {
          action.tool = 'replace_store_catalog';
          action.parameters = userState.storeId
            ? { storeId: userState.storeId }
            : userState.draftId
              ? { draftId: userState.draftId }
              : { storeId: context.activeStoreId };
        } else if (hasDraft && !isGuest) {
          action.tool = 'replace_store_catalog';
          action.parameters = { draftId: context.activeDraftId };
        } else if (hasDraft && isGuest) {
          action.type = 'guide_to_sign_in';
          action.intent = 'guide_to_sign_in';
        } else {
          action.type = 'start_new_workflow';
          action.intent = 'create_store_first';
          action.suggestedActions = [
            {
              id: 'create_store',
              label: 'Create a store',
              description: 'Start your store to add products',
              action: 'start_new_workflow',
              priority: 1,
            },
          ];
        }
        break;

      case 'create_campaign':
        if (hasPermanentStore) {
          action.tool = 'create_campaign';
          action.parameters = { storeId: context.activeStoreId };
        } else if (hasDraft && !isGuest) {
          action.tool = 'create_campaign';
          action.parameters = { draftId: context.activeDraftId };
        } else {
          action.type = 'guide_to_sign_in';
          action.intent = 'guide_to_sign_in';
          action.suggestedActions = [
            {
              id: 'sign_in',
              label: 'Sign in to create campaigns',
              description: 'Save your store and launch campaigns',
              action: 'guide_to_sign_in',
              priority: 1,
            },
          ];
        }
        break;

      case 'upload_asset':
        if (userState.isInWorkflow) {
          action.tool = 'upload_store_asset';
          action.parameters = {
            workflow: userState.workflowType,
            missionId: context.activeMissionId,
          };
          action.confidenceFactors = [
            createConfidenceFactor('in_workflow', 0.3, 'User is in a workflow', 'context'),
          ];
        } else if (hasPermanentStore) {
          action.tool = 'upload_store_asset';
          action.parameters = { storeId: context.activeStoreId };
        } else if (hasDraft) {
          action.tool = 'upload_store_asset';
          action.parameters = { draftId: context.activeDraftId };
        } else {
          action.type = 'ask_clarification';
          action.intent = 'what_workflow';
          action.clarificationPrompt = 'What would you like to do with this asset?';
          action.suggestedActions = [
            {
              id: 'store_asset',
              label: 'Use for store',
              description: 'Add to your store',
              action: 'start_new_workflow',
              priority: 1,
            },
            {
              id: 'campaign_asset',
              label: 'Use for campaign',
              description: 'Add to a campaign',
              action: 'start_new_workflow',
              priority: 2,
            },
          ];
        }
        break;

      case 'analyze_asset':
        action.type = 'ask_clarification';
        action.intent = 'clarification';
        action.clarificationPrompt = this._generateClarificationPrompt(parsedInput, userState);
        action.suggestedActions = [
          {
            id: 'store_asset',
            label: 'Use for store',
            description: 'Add to your store',
            action: 'start_new_workflow',
            priority: 1,
          },
          {
            id: 'campaign_asset',
            label: 'Use for campaign',
            description: 'Add to a campaign',
            action: 'start_new_workflow',
            priority: 2,
          },
        ];
        break;

      case 'clarification':
        action.type = 'ask_clarification';
        action.intent = 'clarification';
        action.tool = null;
        action.clarificationPrompt = goal.clarificationPrompt || 'What would you like to do?';
        action.suggestedActions = this._getDefaultSuggestions(userState);
        break;

      default:
        action.type = 'continue_workflow';
        action.intent = 'general_chat';
        action.tool = 'general_chat';
        action.suggestedActions = this._getDefaultSuggestions(userState);
    }

    return action;
  }

  /**
   * @param {import('./intentTypes.js').UserState} userState
   * @returns {import('./intentTypes.js').SuggestedAction[]}
   */
  _getDefaultSuggestions(userState) {
    const actions = [];

    if (userState.hasStore) {
      actions.push({
        id: 'add_product',
        label: 'Add a product',
        description: 'Add a product to your store',
        action: 'execute_tool',
        tool: 'replace_store_catalog',
        priority: 1,
      });
      actions.push({
        id: 'create_campaign',
        label: 'Create a campaign',
        description: 'Launch a marketing campaign',
        action: 'execute_tool',
        tool: 'create_campaign',
        priority: 2,
      });
    } else {
      actions.push({
        id: 'create_store',
        label: 'Create a store',
        description: 'Start your store',
        action: 'start_new_workflow',
        tool: 'create_store',
        priority: 1,
      });
    }

    actions.push({
      id: 'get_help',
      label: 'Get help',
      description: 'Learn what I can do',
      action: 'show_help',
      priority: 3,
    });

    return actions;
  }

  /**
   * @param {Object} params
   * @returns {import('./intentTypes.js').IntentReasoningResult}
   */
  _buildResult({ goal, action, userState, parsedInput, trace, reasoningId, startTime, context = null }) {
    const reasoningTimeMs = Date.now() - startTime;

    const requiresClarification =
      action.type === 'ask_clarification' ||
      goal.type === 'clarification' ||
      goal.confidence < this.config.minClarificationThreshold;

    const confidenceFactors = [...(action.confidenceFactors || [])];
    if (goal.factors) {
      for (const f of goal.factors) {
        confidenceFactors.push(createConfidenceFactor(f, 0.1, `Goal factor: ${f}`, 'rules'));
      }
    }

    const factorBoost = confidenceFactors.reduce((sum, f) => sum + f.contribution, 0);
    let finalConfidence = Math.min(goal.confidence + factorBoost, 1.0);

    if (this.learningEnabled && this.learning && context?.learning) {
      finalConfidence = this.learning.modelUpdate.applyConfidenceTuning(
        finalConfidence,
        action.intent || goal.type,
        context.learning,
      );
      confidenceFactors.push(
        createConfidenceFactor(
          'learning_calibration',
          finalConfidence - Math.min(goal.confidence + factorBoost, 1.0),
          'Applied learned confidence calibration',
          'ml',
        ),
      );
    }

    const result = createReasoningResult(
      action.intent || goal.type,
      finalConfidence,
      action.type,
      [
        `User state: ${userState.description}`,
        `Goal: ${goal.description} (confidence: ${Math.round(goal.confidence * 100)}%)`,
        `Action: ${action.type}`,
      ],
      {
        reasoningTimeMs,
        contextUsed: ['session', 'store', 'interactions'],
        sources: ['context', 'input', 'rules'],
        confidenceFactors,
        version: INTENT_REASONER_VERSION,
      },
    );

    result.trace = trace;
    result.action = action.type;
    result.tool = action.tool;
    result.parameters = action.parameters || {};
    result.requiresClarification = requiresClarification;
    result.clarificationPrompt = action.clarificationPrompt || null;
    let suggestedActions = action.suggestedActions?.length
      ? action.suggestedActions
      : this._getDefaultSuggestions(userState);

    if (this.learningEnabled && this.learning && context?.preferredTools?.length) {
      suggestedActions = this.learning.personalization.rankSuggestedActions(
        suggestedActions,
        context.preferredTools,
      );
    }

    result.suggestedActions = suggestedActions;
    result.guestGuidance = this._buildGuestGuidance(userState, action);
    result.userState = userState;
    result.parsedInput = parsedInput;

    if (userState.isGuest && action.type === 'guide_to_sign_in') {
      result.reasoning.push('Guest user requires sign-in for this action');
    }

    return result;
  }

  /**
   * @param {import('./intentTypes.js').UserState} userState
   * @param {Object} action
   * @returns {import('./intentTypes.js').GuestGuidance | null}
   */
  _buildGuestGuidance(userState, action) {
    if (!userState.isGuest) return null;

    if (action.type === 'guide_to_sign_in') {
      return {
        requiresSignIn: true,
        message: 'Sign in to save your progress and continue',
        alternativeAction: 'Continue as guest (read-only)',
        whatWillBeLost: 'Your draft store and progress',
        whatWillBeGained: 'Save your store permanently and access all features',
        signInFlow: 'guest_to_user',
      };
    }

    if (userState.hasDraftStore && !userState.hasPermanentStore) {
      return {
        requiresSignIn: false,
        message: 'You have a draft store. Sign in to save it permanently.',
        alternativeAction: 'Continue as guest',
        signInFlow: 'guest_to_user',
      };
    }

    return null;
  }

  /**
   * @param {string} reasoningId
   * @param {number} startTime
   * @param {import('./intentTypes.js').UserState} userState
   * @param {Object} goal
   * @param {Object} action
   */
  _buildTrace(reasoningId, startTime, userState, goal, action) {
    const steps = [
      {
        id: 'step_1',
        action: 'evaluate_state',
        observation: userState.description,
        confidence: 0.5,
      },
      {
        id: 'step_2',
        action: goal.type,
        observation: goal.description,
        confidence: goal.confidence,
      },
      {
        id: 'step_3',
        action: action.type,
        observation: action.intent || action.type,
        confidence: action.confidence ?? goal.confidence,
      },
    ];

    return {
      reasoningId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      steps,
      decision: action.intent || goal.type,
      confidenceProgression: steps.map((step) => ({
        stepId: step.id,
        confidence: step.confidence,
        reason: step.observation,
      })),
    };
  }

  /**
   * @param {Object} input
   * @param {string} reasoningId
   * @param {number} startTime
   */
  _fallbackResult(input, reasoningId, startTime) {
    this.logger.warn?.('[IntentReasoner] No context available, using fallback');

    return {
      intent: 'general_chat',
      confidence: 0.3,
      reasoning: ['No context available, using fallback'],
      trace: {
        reasoningId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        steps: [
          {
            id: 'fallback',
            action: 'fallback',
            observation: 'No context available',
            confidence: 0.3,
          },
        ],
        decision: 'fallback',
        confidenceProgression: [{ stepId: 'fallback', confidence: 0.3, reason: 'No context available' }],
      },
      action: 'show_help',
      tool: null,
      parameters: {},
      requiresClarification: true,
      clarificationPrompt: "I need more context to help you. Could you tell me what you're working on?",
      suggestedActions: [
        {
          id: 'create_store',
          label: 'Create a store',
          description: 'Start your store',
          action: 'start_new_workflow',
          priority: 1,
        },
        {
          id: 'get_help',
          label: 'Get help',
          description: 'Learn what I can do',
          action: 'show_help',
          priority: 2,
        },
      ],
      guestGuidance: null,
      userState: null,
      parsedInput: this._parseInput(input),
      metadata: {
        reasoningTimeMs: Date.now() - startTime,
        contextUsed: [],
        sources: ['fallback'],
        confidenceFactors: [],
        version: INTENT_REASONER_VERSION,
        environment: process.env.NODE_ENV || 'development',
      },
    };
  }

  /**
   * @param {Object} input
   * @param {string} reasoningId
   * @param {number} startTime
   * @param {Error} error
   */
  _errorResult(input, reasoningId, startTime, error) {
    return {
      intent: 'unknown',
      confidence: 0,
      reasoning: [`Reasoning failed: ${error.message}`],
      trace: {
        reasoningId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        steps: [{ id: 'error', action: 'error', observation: error.message, confidence: 0 }],
        decision: 'error',
        confidenceProgression: [{ stepId: 'error', confidence: 0, reason: 'Error' }],
      },
      action: 'show_help',
      tool: null,
      parameters: {},
      requiresClarification: true,
      clarificationPrompt: 'I encountered an error processing your request. Please try again.',
      suggestedActions: [
        {
          id: 'retry',
          label: 'Try again',
          description: 'Retry your request',
          action: 'continue_workflow',
          priority: 1,
        },
      ],
      guestGuidance: null,
      userState: null,
      parsedInput: this._parseInput(input),
      metadata: {
        reasoningTimeMs: Date.now() - startTime,
        contextUsed: [],
        sources: ['error'],
        confidenceFactors: [],
        version: INTENT_REASONER_VERSION,
        environment: process.env.NODE_ENV || 'development',
      },
    };
  }

  /**
   * @returns {string}
   */
  _generateReasoningId() {
    return `reason_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export default IntentReasoner;

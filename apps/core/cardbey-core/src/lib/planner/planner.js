/**
 * ============================================================
 * PHASE C — DYNAMIC PLANNER
 * ============================================================
 *
 * Generates dynamic, executable plans from intent reasoning results.
 */

import crypto from 'node:crypto';
import { PLAN_TEMPLATES, getTemplateForIntent } from './planTemplates.js';
import { emitPlanToBlackboard } from './planBlackboard.js';
import { PLANNER_VERSION } from './constants.js';
import { markPreviewOnlySteps, normalizePlanSteps } from './plannerToolNormalization.js';

/**
 * Dynamic Planner — context-aware plan generation from reasoned intent.
 */
export class Planner {
  /**
   * @param {Object} [options]
   * @param {Console} [options.logger]
   * @param {Partial<import('./plannerTypes.js').PlannerConfig>} [options.config]
   */
  constructor({ logger = console, config = {} } = {}) {
    this.logger = logger;
    this.config = {
      maxSteps: 20,
      guestAwareEnabled: true,
      conditionStepsEnabled: true,
      defaultStepDuration: 3,
      version: PLANNER_VERSION,
      ...config,
    };
  }

  /**
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   * @param {import('../context/contextTypes.js').UserContext | Record<string, unknown>} context
   * @param {Object} [options]
   * @returns {import('./plannerTypes.js').PlanGenerationResult}
   */
  generatePlan(reasoningResult, context, options = {}) {
    const startTime = Date.now();
    const locale = options.locale === 'vi' ? 'vi' : 'en';

    this.logger.debug?.('[Planner] Generating plan', {
      intent: reasoningResult.intent,
      confidence: reasoningResult.confidence,
      userId: context?.userId,
      isGuest: this._isGuest(context),
    });

    try {
      const template = this._getTemplate(reasoningResult.intent, context);
      let customizedSteps = this._customizeSteps(template.steps, context, reasoningResult, locale);
      customizedSteps = markPreviewOnlySteps(normalizePlanSteps(customizedSteps));
      const plan = this._buildPlan(
        reasoningResult,
        context,
        customizedSteps,
        template.metadata,
        template.workflow,
        locale,
      );

      const validation = this._validatePlan(plan);
      if (!validation.valid) {
        this.logger.warn?.('[Planner] Plan validation failed', { errors: validation.errors });
      }

      const generationTimeMs = Date.now() - startTime;

      this.logger.debug?.('[Planner] Plan generated', {
        planId: plan.planId,
        steps: plan.steps.length,
        generationTimeMs,
        requiresSignIn: plan.metadata.requiresSignIn,
      });

      return {
        plan,
        success: validation.valid,
        error: validation.valid ? undefined : validation.errors.join('; '),
        generationTimeMs,
        alternatives: this._generateAlternatives(reasoningResult, context),
      };
    } catch (error) {
      this.logger.error?.('[Planner] Plan generation failed', {
        error: error.message,
        stack: error.stack,
      });

      return {
        plan: this._createFallbackPlan(reasoningResult, context),
        success: false,
        error: error.message,
        generationTimeMs: Date.now() - startTime,
        alternatives: [],
      };
    }
  }

  /**
   * Publish plan steps to the blackboard for real-time UI projection.
   *
   * @param {string} missionId
   * @param {import('./plannerTypes.js').DynamicPlan} plan
   * @param {Object} [options]
   */
  async publishPlanToBlackboard(missionId, plan, options = {}) {
    return emitPlanToBlackboard(missionId, plan, options);
  }

  /**
   * @param {string} intent
   * @param {Record<string, unknown>} context
   */
  _getTemplate(intent, context) {
    const templateContext = {
      ...context,
      isGuest: this._isGuest(context),
      hasStore: this._hasStore(context),
    };

    const template = getTemplateForIntent(intent, templateContext);
    if (!template) {
      this.logger.warn?.('[Planner] No template found for intent, using fallback', { intent });
      return PLAN_TEMPLATES.general_chat;
    }
    return template;
  }

  /**
   * @param {import('./plannerTypes.js').PlanTemplateStep[]} steps
   * @param {Record<string, unknown>} context
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   * @param {string} locale
   */
  _customizeSteps(steps, context, reasoningResult, locale) {
    const isGuest = this._isGuest(context);
    const hasStore = this._hasStore(context);
    const isSignedIn = !isGuest;

    let customizedSteps = steps.map((step) => this._normalizeTemplateStep(step, locale));

    if (isGuest && this.config.guestAwareEnabled) {
      customizedSteps = customizedSteps.map((step) => {
        if (step.guestBehavior === 'guide_to_sign_in' && step.type !== 'checkpoint') {
          return {
            ...step,
            type: 'checkpoint',
            label: locale === 'vi' ? 'Đăng nhập để tiếp tục' : 'Sign in to continue',
            labels: {
              en: 'Sign in to continue',
              vi: 'Đăng nhập để tiếp tục',
            },
            checkpointConfig: {
              type: 'confirmation',
              prompt:
                locale === 'vi'
                  ? 'Đăng nhập để tiếp tục với hành động này'
                  : 'Sign in to continue with this action',
              required: true,
              labels: {
                en: 'Sign in to continue with this action',
                vi: 'Đăng nhập để tiếp tục với hành động này',
              },
            },
          };
        }
        if (step.guestBehavior === 'block') {
          return {
            ...step,
            type: 'checkpoint',
            label: locale === 'vi' ? 'Cần đăng nhập' : 'Sign in required',
            labels: {
              en: 'Sign in required',
              vi: 'Cần đăng nhập',
            },
            checkpointConfig: {
              type: 'confirmation',
              prompt: locale === 'vi' ? 'Đăng nhập để tiếp tục' : 'Sign in to continue',
              required: true,
            },
          };
        }
        return step;
      });
    }

    if (isSignedIn) {
      customizedSteps = customizedSteps.map((step) => {
        if (step.guestBehavior === 'guide_to_sign_in') {
          const { checkpointConfig, ...rest } = step;
          return {
            ...rest,
            guestBehavior: 'allow',
            type: step.name === 'validate_store_context' ? 'action' : step.type,
          };
        }
        return step;
      });
    }

    if (!hasStore && reasoningResult.intent !== 'create_store') {
      customizedSteps = [
        this._normalizeTemplateStep(
          {
            id: 'step_0',
            name: 'create_store_first',
            label: locale === 'vi' ? 'Đang tạo cửa hàng trước...' : 'Creating a store first...',
            labelVI: 'Đang tạo cửa hàng trước...',
            type: 'action',
            tool: 'create_store',
            optional: false,
            dependencies: [],
            estimatedDuration: 5,
            guestBehavior: 'allow',
          },
          locale,
        ),
        ...customizedSteps,
      ];
    }

    if (reasoningResult.tool && reasoningResult.intent !== 'general_chat') {
      customizedSteps = this._injectPrimaryToolStep(customizedSteps, reasoningResult, locale);
    }

    customizedSteps = customizedSteps.map((step, index) => ({
      ...step,
      order: index + 1,
      id: step.id || `step_${index + 1}`,
    }));

    return this._injectLabels(customizedSteps, context, reasoningResult);
  }

  /**
   * Ensure the reasoner's primary tool appears on a matching step.
   */
  _injectPrimaryToolStep(steps, reasoningResult, locale) {
    const tool = String(reasoningResult.tool ?? '').trim();
    if (!tool) return steps;

    const matchIndex = steps.findIndex((s) => s.tool === tool);
    if (matchIndex >= 0) {
      return steps.map((step, idx) =>
        idx === matchIndex
          ? {
              ...step,
              parameters: reasoningResult.parameters,
              label:
                locale === 'vi'
                  ? step.labels?.vi || step.label
                  : step.labels?.en || step.label,
            }
          : step,
      );
    }

    return steps;
  }

  /**
   * @param {import('./plannerTypes.js').PlanTemplateStep} step
   * @param {string} locale
   */
  _normalizeTemplateStep(step, locale) {
    const labels = {
      en: step.label,
      vi: step.labelVI || step.label,
    };

    let checkpointConfig = step.checkpointConfig;
    if (checkpointConfig && step.checkpointConfig?.promptVI) {
      checkpointConfig = {
        ...checkpointConfig,
        labels: {
          en: checkpointConfig.prompt,
          vi: step.checkpointConfig.promptVI,
        },
      };
    }

    return {
      id: step.id,
      name: step.name,
      label: locale === 'vi' ? labels.vi : labels.en,
      labels,
      type: step.type,
      tool: step.tool ?? null,
      optional: step.optional ?? false,
      dependencies: Array.isArray(step.dependencies) ? [...step.dependencies] : [],
      estimatedDuration: step.estimatedDuration ?? this.config.defaultStepDuration,
      guestBehavior: step.guestBehavior,
      checkpointConfig,
    };
  }

  /**
   * @param {import('./plannerTypes.js').PlanStep[]} steps
   * @param {Record<string, unknown>} context
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   */
  _injectLabels(steps, context, reasoningResult) {
    const storeName =
      (typeof context?.activeStoreName === 'string' && context.activeStoreName.trim()) ||
      (typeof reasoningResult.userState?.storeId === 'string' && reasoningResult.userState.storeId) ||
      'your store';

    return steps.map((step) => ({
      ...step,
      label: step.label?.replace(/\{storeName\}/g, storeName) || step.label,
      labels: step.labels
        ? Object.fromEntries(
            Object.entries(step.labels).map(([lang, text]) => [
              lang,
              String(text).replace(/\{storeName\}/g, storeName),
            ]),
          )
        : step.labels,
    }));
  }

  /**
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   * @param {Record<string, unknown>} context
   * @param {import('./plannerTypes.js').PlanStep[]} steps
   * @param {import('./plannerTypes.js').PlanMetadata} templateMetadata
   * @param {import('../intent/intentTypes.js').WorkflowType} workflow
   * @param {string} locale
   */
  _buildPlan(reasoningResult, context, steps, templateMetadata, workflow, locale) {
    const planId = `plan_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const requiresSignIn =
      this._isGuest(context) &&
      steps.some((s) => s.guestBehavior === 'guide_to_sign_in' || s.guestBehavior === 'block');

    const requiresStore =
      templateMetadata.requiresStore ||
      steps.some((s) =>
        ['replace_store_catalog', 'create_campaign', 'generate_graphic', 'create_catalog'].includes(
          String(s.tool ?? ''),
        ),
      );

    const estimatedDuration = steps.reduce(
      (sum, s) => sum + (s.estimatedDuration || this.config.defaultStepDuration),
      0,
    );

    const reasoning = [
      `Generating plan for intent: ${reasoningResult.intent}`,
      `Confidence: ${Math.round(reasoningResult.confidence * 100)}%`,
      `User state: ${reasoningResult.userState?.description || 'unknown'}`,
      `Steps: ${steps.length}`,
      `Requires sign-in: ${requiresSignIn}`,
      `Requires store: ${requiresStore}`,
      `Locale: ${locale}`,
    ];

    return {
      planId,
      intent: reasoningResult.intent,
      workflow: workflow || 'unknown',
      steps,
      metadata: {
        totalSteps: steps.length,
        estimatedDuration,
        requiresSignIn,
        requiresStore,
        primaryTool:
          reasoningResult.tool ||
          steps.find((s) => s.tool)?.tool ||
          templateMetadata.primaryTool ||
          null,
        tags: templateMetadata.tags || [],
        priority: templateMetadata.priority || 3,
      },
      contextSnapshot: {
        activeStoreId: context?.activeStoreId ?? reasoningResult.userState?.storeId ?? null,
        activeDraftId: context?.activeDraftId ?? reasoningResult.userState?.draftId ?? null,
        activeStoreName: context?.activeStoreName ?? null,
        isGuest: this._isGuest(context),
        currentWorkflow: context?.currentWorkflow ?? reasoningResult.userState?.workflowType ?? null,
        userId: context?.userId ?? null,
      },
      reasoning,
      suggestedActions: reasoningResult.suggestedActions || [],
      generatedAt: new Date().toISOString(),
      version: this.config.version,
    };
  }

  /**
   * @param {import('./plannerTypes.js').DynamicPlan} plan
   */
  _validatePlan(plan) {
    const errors = [];

    if (!plan.planId) errors.push('Plan missing ID');
    if (!plan.intent) errors.push('Plan missing intent');
    if (!plan.steps?.length) errors.push('Plan has no steps');
    if (plan.steps?.length > this.config.maxSteps) {
      errors.push(`Plan has ${plan.steps.length} steps, max is ${this.config.maxSteps}`);
    }

    const stepIds = plan.steps.map((s) => s.id);
    const duplicates = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate step IDs: ${duplicates.join(', ')}`);
    }

    for (const step of plan.steps) {
      if (!step.label?.trim()) errors.push(`Step ${step.id} missing label`);
      if (step.type === 'checkpoint' && !step.checkpointConfig) {
        errors.push(`Checkpoint step ${step.id} missing checkpointConfig`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   * @param {Record<string, unknown>} context
   */
  _generateAlternatives(reasoningResult, context) {
    const alternatives = [];
    const hasStore = this._hasStore(context);

    if (reasoningResult.intent !== 'create_store') {
      alternatives.push({
        id: 'create_store',
        label: 'Create a store',
        description: 'Start your store',
        action: 'start_new_workflow',
        priority: 1,
      });
    }

    if (reasoningResult.intent !== 'add_product' && hasStore) {
      alternatives.push({
        id: 'add_product',
        label: 'Add a product',
        description: 'Add a product to your store',
        action: 'execute_tool',
        tool: 'replace_store_catalog',
        priority: 2,
      });
    }

    if (reasoningResult.intent !== 'create_campaign' && hasStore) {
      alternatives.push({
        id: 'create_campaign',
        label: 'Create a campaign',
        description: 'Launch a marketing campaign',
        action: 'execute_tool',
        tool: 'create_campaign',
        priority: 3,
      });
    }

    alternatives.push({
      id: 'get_help',
      label: 'Get help',
      description: 'Learn what I can do',
      action: 'show_help',
      priority: 4,
    });

    return alternatives;
  }

  /**
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   * @param {Record<string, unknown>} context
   */
  _createFallbackPlan(reasoningResult, context) {
    return {
      planId: `plan_fallback_${Date.now()}`,
      intent: reasoningResult?.intent || 'general_chat',
      workflow: 'unknown',
      steps: [
        {
          id: 'step_1',
          name: 'process_message',
          label: 'Processing your request...',
          labels: { en: 'Processing your request...', vi: 'Đang xử lý yêu cầu...' },
          type: 'action',
          tool: 'general_chat',
          optional: false,
          dependencies: [],
          estimatedDuration: 2,
          guestBehavior: 'allow',
          order: 1,
        },
      ],
      metadata: {
        totalSteps: 1,
        estimatedDuration: 2,
        requiresSignIn: false,
        requiresStore: false,
        primaryTool: 'general_chat',
        tags: ['chat', 'fallback'],
        priority: 5,
      },
      contextSnapshot: {
        userId: context?.userId ?? null,
        isGuest: this._isGuest(context),
      },
      reasoning: ['Fallback plan generated due to error'],
      suggestedActions: [],
      generatedAt: new Date().toISOString(),
      version: this.config.version,
    };
  }

  /**
   * @param {string} planId
   */
  async getPlan(planId) {
    this.logger.debug?.('[Planner] Get plan', { planId });
    return null;
  }

  /**
   * @param {import('./plannerTypes.js').DynamicPlan} plan
   * @param {Record<string, unknown>} context
   */
  async executePlan(plan, context = {}) {
    this.logger.debug?.('[Planner] Execute plan', {
      planId: plan.planId,
      steps: plan.steps.length,
      missionId: context?.missionId ?? null,
    });

    const { executeDynamicPlan, isDynamicPlannerExecutionEnabled } = await import('./planExecutor.js');

    const missionId = String(context?.missionId ?? '').trim();
    if (!missionId) {
      return {
        ok: false,
        status: 'missing_mission',
        plan,
        message: 'missionId is required for plan execution',
      };
    }

    if (!isDynamicPlannerExecutionEnabled()) {
      return {
        ok: false,
        status: 'disabled',
        plan,
        message: 'Dynamic plan execution is disabled (ENABLE_DYNAMIC_PLANNER_EXECUTION=false)',
      };
    }

    return executeDynamicPlan({
      plan,
      missionId,
      user: context.user ?? null,
      planParameters:
        context.planParameters && typeof context.planParameters === 'object'
          ? context.planParameters
          : {},
      stepNumber: context.stepNumber ?? null,
      source: typeof context.source === 'string' ? context.source : 'planner_execute_plan',
      traceId: typeof context.traceId === 'string' ? context.traceId : null,
      runMode: context.runMode === 'all' || context.runMode === 'until_blocked' ? context.runMode : 'next',
      materializePipelineSteps: context.materializePipelineSteps !== false,
    });
  }

  /**
   * @param {Record<string, unknown>} context
   */
  _isGuest(context) {
    return (
      Boolean(context?.isGuest) ||
      String(context?.userId ?? '').startsWith('guest_') ||
      Boolean(context?.userState?.isGuest)
    );
  }

  /**
   * @param {Record<string, unknown>} context
   */
  _hasStore(context) {
    return Boolean(
      context?.activeStoreId ||
        context?.activeDraftId ||
        context?.userState?.hasStore ||
        context?.userState?.storeId ||
        context?.userState?.draftId,
    );
  }
}

export default Planner;

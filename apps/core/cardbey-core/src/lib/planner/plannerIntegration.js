/**
 * ============================================================
 * PHASE C.2 — DYNAMIC PLANNER INTEGRATION
 * ============================================================
 *
 * Wires Dynamic Planner into the Performer Intake V2 pipeline.
 */

import { createReasoningResult } from '../intent/utils.js';
import { planFromReasoning, isDynamicPlannerEnabled } from './intentPlannerBridge.js';
import { emitPlanToBlackboard } from './planBlackboard.js';
import { PLANNER_VERSION } from './constants.js';
import {
  dynamicPlanToProactivePlanSteps,
  serializeDynamicPlanForClient,
} from './planConverters.js';
import {
  deserializeClientDynamicPlan,
  executeDynamicPlan,
  isDynamicPlannerExecutionEnabled,
  loadDynamicPlanFromMission,
} from './planExecutor.js';
export {
  markPreviewOnlySteps,
  normalizePlanSteps,
  normalizePlanTools,
  normalizePlannerToolName,
  PLANNER_TOOL_ALIASES,
} from './plannerToolNormalization.js';

/** @type {PlannerIntegration | null} */
let integrationSingleton = null;

/**
 * @returns {PlannerIntegration}
 */
export function getPlannerIntegration() {
  if (!integrationSingleton) {
    integrationSingleton = new PlannerIntegration();
  }
  return integrationSingleton;
}

/** @internal tests */
export function resetPlannerIntegrationForTests() {
  integrationSingleton = null;
}

export class PlannerIntegration {
  /**
   * @param {Object} [options]
   * @param {Console} [options.logger]
   */
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * @param {import('express').Request} req
   * @returns {boolean}
   */
  isEnabled(req) {
    const header = String(req?.headers?.['x-enable-dynamic-planner'] ?? '').trim().toLowerCase();
    if (header === 'false') return false;
    if (header === 'true') return true;
    return isDynamicPlannerEnabled();
  }

  /**
   * @param {import('express').Request} [req]
   * @returns {boolean}
   */
  isExecutionEnabled(req) {
    const header = String(req?.headers?.['x-enable-dynamic-planner-execution'] ?? '')
      .trim()
      .toLowerCase();
    if (header === 'false') return false;
    if (header === 'true') return true;
    return isDynamicPlannerExecutionEnabled();
  }

  /**
   * Generate a dynamic plan for an intake classification when enabled.
   *
   * @param {Object} params
   * @param {Record<string, unknown>} params.classification
   * @param {import('../intent/intentTypes.js').IntentReasoningResult | null} [params.reasoningResult]
   * @param {Record<string, unknown>} [params.context]
   * @param {string} [params.locale]
   * @param {string | null} [params.missionId]
   * @param {import('express').Request} [params.req]
   * @returns {Promise<DynamicPlanBundle | null>}
   */
  async maybeGenerateForIntake({
    classification,
    reasoningResult = null,
    context = {},
    locale = 'en',
    missionId = null,
    req,
  }) {
    if (req && !this.isEnabled(req)) return null;
    if (!this._shouldGeneratePlan(classification)) return null;

    const resolvedReasoning = reasoningResult || this._reasoningFromClassification(classification);
    if (!resolvedReasoning) return null;

    const planContext = this._buildPlanContext(context, classification, resolvedReasoning);
    const generation = planFromReasoning(resolvedReasoning, planContext, { locale });

    if (!generation?.plan) return null;

    const proactivePlanSteps = dynamicPlanToProactivePlanSteps(generation.plan);
    const bundle = {
      plan: generation.plan,
      generation,
      proactivePlanSteps,
      serialized: serializeDynamicPlanForClient(generation.plan),
    };

    const mid = String(missionId ?? '').trim();
    if (mid) {
      try {
        bundle.blackboard = await emitPlanToBlackboard(mid, generation.plan);
        this.logger.debug?.('[PlannerIntegration] Published plan to blackboard', {
          missionId: mid,
          planId: generation.plan.planId,
          emitted: bundle.blackboard?.emitted,
        });
      } catch (err) {
        this.logger.warn?.('[PlannerIntegration] Blackboard publish failed (non-blocking)', {
          missionId: mid,
          error: err?.message ?? err,
        });
      }
    }

    return bundle;
  }

  /**
   * Execute a dynamic plan for intake when explicitly requested by the client.
   *
   * @param {Object} params
   * @param {string} params.missionId
   * @param {object} [params.user]
   * @param {Record<string, unknown> | import('./plannerTypes.js').DynamicPlan | null} [params.dynamicPlan]
   * @param {DynamicPlanBundle | null} [params.bundle]
   * @param {Record<string, unknown>} [params.planParameters]
   * @param {number | null} [params.stepNumber]
   * @param {'next' | 'all' | 'until_blocked'} [params.runMode]
   * @param {string | null} [params.traceId]
   * @param {import('express').Request} [params.req]
   */
  async executeDynamicPlanForIntake({
    missionId,
    user = null,
    dynamicPlan = null,
    bundle = null,
    planParameters = {},
    stepNumber = 1,
    runMode = 'next',
    traceId = null,
    req,
  }) {
    if (req && (!this.isEnabled(req) || !this.isExecutionEnabled(req))) return null;

    const mid = String(missionId ?? '').trim();
    if (!mid) return null;

    let plan =
      bundle?.plan ??
      (dynamicPlan && Array.isArray(dynamicPlan.steps)
        ? dynamicPlan
        : deserializeClientDynamicPlan(dynamicPlan));

    if (!plan?.steps?.length) {
      plan = await loadDynamicPlanFromMission(mid, plan);
    }
    if (!plan?.steps?.length) return null;

    const execution = await executeDynamicPlan({
      plan,
      missionId: mid,
      user,
      planParameters,
      stepNumber,
      runMode,
      traceId,
      source: 'intake_v2_execute_dynamic_plan',
    });

    this.logger.debug?.('[PlannerIntegration] Executed dynamic plan', {
      missionId: mid,
      planId: plan.planId,
      ok: execution.ok,
      code: execution.code ?? execution.orchestration?.code ?? null,
    });

    return execution;
  }

  /**
   * @param {Record<string, unknown>} classification
   */
  _shouldGeneratePlan(classification) {
    const executionPath = String(classification?.executionPath ?? '').trim();
    if (executionPath === 'clarify' || executionPath === 'service_request') return false;
    if (classification?._requiresSignIn) return false;
    if (classification?._reasoningFallback) {
      return process.env.ENABLE_DYNAMIC_PLANNER_LEGACY === 'true';
    }
    const tool = String(classification?.tool ?? '').trim();
    if (!tool && executionPath === 'chat') return false;
    return true;
  }

  /**
   * @param {Record<string, unknown>} classification
   */
  _reasoningFromClassification(classification) {
    if (classification?._reasoningResult) {
      return classification._reasoningResult;
    }

    const intent =
      (classification?._reasoning && typeof classification._reasoning === 'object'
        ? classification._reasoning.intent
        : null) || toolToIntent(classification?.tool);

    if (!intent) return null;

    return createReasoningResult(
      intent,
      typeof classification.confidence === 'number' ? classification.confidence : 0.5,
      mapExecutionPathToAction(classification.executionPath),
      Array.isArray(classification._reasoning?.reasoning)
        ? classification._reasoning.reasoning
        : classification.message
          ? [String(classification.message)]
          : [`Classified as ${classification.tool ?? intent}`],
      {
        sources: [classification._classificationSource || 'legacy_classifier'],
        version: PLANNER_VERSION,
      },
    );
  }

  /**
   * @param {Record<string, unknown>} context
   * @param {Record<string, unknown>} classification
   * @param {import('../intent/intentTypes.js').IntentReasoningResult} reasoningResult
   */
  _buildPlanContext(context, classification, reasoningResult) {
    const params =
      classification.parameters && typeof classification.parameters === 'object'
        ? classification.parameters
        : {};

    return {
      ...context,
      userId:
        context.userId ??
        (reasoningResult.userState?.isGuest
          ? String(context.userId ?? '').startsWith('guest_')
            ? context.userId
            : `guest_${context.sessionId ?? 'anon'}`
          : context.userId ?? null),
      activeStoreId:
        context.activeStoreId ??
        params.storeId ??
        reasoningResult.userState?.storeId ??
        null,
      activeDraftId:
        context.activeDraftId ?? params.draftId ?? reasoningResult.userState?.draftId ?? null,
      activeStoreName: context.activeStoreName ?? null,
      currentWorkflow: context.currentWorkflow ?? reasoningResult.userState?.workflowType ?? null,
      userState: reasoningResult.userState ?? null,
    };
  }
}

/**
 * @typedef {Object} DynamicPlanBundle
 * @property {import('./plannerTypes.js').DynamicPlan} plan
 * @property {import('./plannerTypes.js').PlanGenerationResult} generation
 * @property {Array<Record<string, unknown>>} proactivePlanSteps
 * @property {Record<string, unknown>} serialized
 * @property {{ emitted?: number; planId?: string } | undefined} [blackboard]
 */

/**
 * @param {string | null | undefined} tool
 */
export function toolToIntent(tool) {
  const map = {
    create_store: 'create_store',
    replace_store_catalog: 'add_product',
    create_campaign: 'create_campaign',
    launch_campaign: 'create_campaign',
    generate_graphic: 'generate_graphic',
    create_promotion_graphic: 'generate_graphic',
    upload_store_asset: 'upload_asset',
    general_chat: 'general_chat',
    create_catalog: 'create_catalog',
  };
  const key = String(tool ?? '').trim();
  return map[key] || (key ? key : 'general_chat');
}

/**
 * @param {string | null | undefined} executionPath
 */
function mapExecutionPathToAction(executionPath) {
  const path = String(executionPath ?? '').trim();
  if (path === 'clarify') return 'ask_clarification';
  if (path === 'direct_action' || path === 'kernel_dispatch') return 'execute_tool';
  if (path === 'proactive_plan') return 'execute_tool';
  if (path === 'chat') return 'continue_workflow';
  return 'execute_tool';
}

export { dynamicPlanToProactivePlanSteps, serializeDynamicPlanForClient } from './planConverters.js';

/**
 * Merge dynamic plan into classification for proactive_plan dispatch.
 *
 * @param {Record<string, unknown>} classification
 * @param {DynamicPlanBundle} bundle
 */
export function applyDynamicPlanToClassification(classification, bundle) {
  if (!bundle?.plan) return classification;

  const next = {
    ...classification,
    _dynamicPlan: bundle.serialized,
    _plannerSource: 'dynamic_planner',
  };

  const existingPlan = Array.isArray(classification.plan) ? classification.plan : [];
  if (existingPlan.length === 0 && bundle.proactivePlanSteps.length > 0) {
    next.plan = bundle.proactivePlanSteps;
  }

  if (
    bundle.proactivePlanSteps.length > 0 &&
    (!next.executionPath || next.executionPath === 'chat' || next.executionPath === 'execute_tool')
  ) {
    const toolEntry = String(next.tool ?? '').trim();
    if (['create_store', 'replace_store_catalog', 'create_campaign', 'generate_graphic'].includes(toolEntry)) {
      next.executionPath = 'proactive_plan';
    }
  }

  return next;
}

export default PlannerIntegration;

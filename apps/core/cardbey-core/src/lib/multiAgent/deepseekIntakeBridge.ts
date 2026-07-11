/**
 * Bridge between DeepSeek multi-agent orchestrator and Performer intake / unified dispatch.
 */

import { Orchestrator } from '../../multiAgent/orchestrator/orchestrator.js';
import { Intent as DeepSeekIntent } from '../../multiAgent/types/agent.types.js';
import type { MissionPlan, MissionResult } from '../../multiAgent/types/agent.types.js';
import { loadMultiAgentRuntimeConfig } from '../../multiAgent/config/agent.config.js';
import { withCanonicalRuntimeState } from '../runtime/canonicalRuntimeState.js';
import { executeMissionAction } from '../execution/executeMissionAction.js';
import { registerCoreTools } from '../../tools/coreTools.js';
import { getToolRegistry } from '../../tools/ToolRegistry.js';
import {
  isCompilerSpineIntake,
  isCampaignOrLoyaltyMessage,
} from './campaignPlanHelpers.js';
import { generateMultiStoreClarificationResponse } from './multiStorePlanHelpers.js';

export interface DeepSeekIntakeContext {
  missionId?: string | null;
  locale?: string;
  actorId?: string | null;
  storeId?: string | null;
}

export interface DeepSeekIntakeIntegrationResult {
  handled: boolean;
  classification?: Record<string, unknown>;
  response?: Record<string, unknown>;
  telemetry?: Record<string, unknown>;
}

let orchestratorSingleton: Orchestrator | null = null;

function getOrchestrator(): Orchestrator {
  if (!orchestratorSingleton) {
    registerCoreTools();
    const toolRegistry = getToolRegistry();
    orchestratorSingleton = new Orchestrator({
      stepExecutor: async (step, ctx) => {
        const toolName = String(step.action ?? '').trim();
        if (!toolName) {
          return { result: { ok: false, error: 'Missing step action' } };
        }
        if (toolRegistry.has(toolName)) {
          const result = await toolRegistry.execute(
            toolName,
            (step.parameters as Record<string, unknown>) ?? {},
            {
              userId: ctx.userId ?? null,
              storeId: ctx.storeId ?? null,
              missionId: ctx.missionId ?? null,
              source: 'deepseek_multi_agent',
            },
          );
          return { result };
        }
        const dispatch = await executeMissionAction({
          actionType: 'dispatch_tool',
          payload: {
            toolName,
            input: step.parameters ?? {},
            context: ctx,
          },
          missionId: ctx.missionId ?? null,
          userId: ctx.userId ?? null,
          storeId: ctx.storeId ?? null,
          source: 'deepseek_multi_agent',
        });
        return {
          result: {
            ok: dispatch.status === 'ok',
            output: dispatch.output,
            error: dispatch.error?.message ?? dispatch.blocker?.message,
          },
        };
      },
    });
  }
  return orchestratorSingleton;
}

export function resetDeepSeekIntakeBridgeForTests(): void {
  orchestratorSingleton = null;
}

export function isDeepSeekMultiAgentIntakeEnabled(): boolean {
  return loadMultiAgentRuntimeConfig().enabled;
}

export function isDeepSeekMultiAgentShadowMode(): boolean {
  return process.env.MULTI_AGENT_SHADOW === 'true';
}

const SETUP_INTENTS = new Set([
  DeepSeekIntent.STORE_SETUP,
  DeepSeekIntent.STORE_UPDATE,
  DeepSeekIntent.MISSION_PLANNING,
]);

const QUERY_INTENTS = new Set([
  DeepSeekIntent.GENERAL_QUERY,
  DeepSeekIntent.SUPPORT,
  DeepSeekIntent.STORE_QUERY,
]);

function mapDeepSeekIntentToTool(intent: DeepSeekIntent): string {
  switch (intent) {
    case DeepSeekIntent.STORE_SETUP:
    case DeepSeekIntent.MISSION_PLANNING:
      return 'create_store';
    case DeepSeekIntent.STORE_UPDATE:
      return 'create_store';
    case DeepSeekIntent.STORE_QUERY:
      return 'general_chat';
    case DeepSeekIntent.SUPPORT:
    case DeepSeekIntent.GENERAL_QUERY:
    default:
      return 'general_chat';
  }
}

function planToTopology(plan: MissionPlan) {
  const nodes = plan.steps.map((step, index) => ({
    id: step.id,
    label: step.action,
    type: 'agent_step',
    order: index + 1,
    parameters: step.parameters,
    validation: step.validation ?? null,
  }));

  const edges: Array<{ from: string; to: string }> = [];
  for (const step of plan.steps) {
    const deps = plan.dependencies[step.action] ?? step.dependencies ?? [];
    for (const dep of deps) {
      const fromStep = plan.steps.find((s) => s.action === dep || s.id === dep);
      if (fromStep) {
        edges.push({ from: fromStep.id, to: step.id });
      }
    }
  }

  return { nodes, edges };
}

export function buildDeepSeekMissionMetadata(missionResult: MissionResult): Record<string, unknown> {
  return {
    multiAgentStatus:
      missionResult.status === 'pending_human_review'
        ? 'pending_approval'
        : missionResult.status === 'completed'
          ? 'approved'
          : missionResult.status,
    multiAgentReasoning: {
      provider: 'deepseek',
      intent: missionResult.intent,
      confidence: missionResult.telemetry.qualityMetrics?.intentConfidence,
      criticConfidence: missionResult.telemetry.qualityMetrics?.criticConfidence,
      review: missionResult.review,
      telemetry: missionResult.telemetry,
      shadowComparison: missionResult.telemetry.shadowComparison,
    },
    deepSeekPlan: missionResult.plan,
    deepSeekExecution: missionResult.execution,
  };
}

export function mergeDeepSeekShadowIntoClassification(
  classification: Record<string, unknown>,
  missionResult: MissionResult,
): Record<string, unknown> {
  const tool = mapDeepSeekIntentToTool(missionResult.intent);
  return {
    ...classification,
    _deepSeekMultiAgent: {
      missionId: missionResult.missionId,
      intent: missionResult.intent,
      status: missionResult.status,
      telemetry: missionResult.telemetry,
      review: missionResult.review,
      planStepCount: missionResult.plan?.steps.length ?? 0,
      shadowMode: isDeepSeekMultiAgentShadowMode(),
    },
    ...(missionResult.plan
      ? {
          _deepSeekPlan: missionResult.plan,
        }
      : {}),
    ...(SETUP_INTENTS.has(missionResult.intent) && !classification.tool
      ? { tool }
      : {}),
  };
}

export function buildShowExecutionPlanFromDeepSeek(
  missionResult: MissionResult,
  context: DeepSeekIntakeContext = {},
): Record<string, unknown> {
  const plan = missionResult.plan;
  const topology = plan ? planToTopology(plan) : { nodes: [], edges: [] };
  const metadata = buildDeepSeekMissionMetadata(missionResult);
  const missionId = context.missionId ?? missionResult.missionId;
  const multiAgentStatus =
    missionResult.status === 'pending_human_review' ? 'pending_approval' : 'approved';

  return withCanonicalRuntimeState({
    success: true,
    action: 'show_execution_plan',
    missionId,
    storeId: context.storeId ?? null,
    executionPath: 'deepseek_multi_agent',
    multiAgentStatus,
    response: missionResult.finalResponse,
    executionPlan: {
      topology,
      policy: {
        requiredTools: plan?.requiredTools ?? [],
        estimatedComplexity: plan?.estimatedComplexity ?? 'medium',
        hitlRequired: missionResult.status === 'pending_human_review',
      },
      reasoning: {
        provider: 'deepseek',
        summary: missionResult.finalResponse,
        review: missionResult.review,
        intent: missionResult.intent,
      },
      metadata,
    },
    pendingTopology: topology,
    pendingReasoning: metadata.multiAgentReasoning,
    plan: plan
      ? {
          toolName: mapDeepSeekIntentToTool(missionResult.intent),
          nodeCount: plan.steps.length,
          estimatedComplexity: plan.estimatedComplexity,
          requiresAuthentication: true,
        }
      : undefined,
    multiAgentDeepSeek: {
      missionId: missionResult.missionId,
      intent: missionResult.intent,
      status: missionResult.status,
      telemetry: missionResult.telemetry,
    },
  });
}

export function buildChatResponseFromDeepSeek(missionResult: MissionResult): Record<string, unknown> {
  return withCanonicalRuntimeState({
    success: true,
    action: 'chat',
    executionPath: 'deepseek_multi_agent',
    tool: 'general_chat',
    response: missionResult.finalResponse,
    message: missionResult.finalResponse,
    multiAgentDeepSeek: {
      missionId: missionResult.missionId,
      intent: missionResult.intent,
      telemetry: missionResult.telemetry,
    },
  });
}

export function buildClarificationResponseFromDeepSeek(
  missionResult: MissionResult,
): Record<string, unknown> {
  const clarificationMessage =
    missionResult.plan?.clarificationMessage ??
    (missionResult.plan?.multiStore
      ? generateMultiStoreClarificationResponse(missionResult.plan.multiStore)
      : missionResult.finalResponse);

  return withCanonicalRuntimeState({
    success: true,
    action: 'create_store',
    executionPath: 'deepseek_multi_agent',
    tool: 'create_store',
    response: clarificationMessage,
    message: clarificationMessage,
    needsClarification: true,
    missingFields: missionResult.plan?.missingFields ?? [],
    multiStore: missionResult.plan?.multiStore ?? null,
    deepSeekPlan: missionResult.plan,
    multiAgentDeepSeek: {
      missionId: missionResult.missionId,
      intent: missionResult.intent,
      telemetry: missionResult.telemetry,
      needsClarification: true,
    },
  });
}

export function buildHitlResponseFromDeepSeek(missionResult: MissionResult): Record<string, unknown> {
  const base = buildShowExecutionPlanFromDeepSeek(missionResult);
  const issues = missionResult.review?.issues ?? [];
  const suggestions = missionResult.review?.suggestions ?? [];

  return {
    ...base,
    action: 'approval_required',
    requiresConfirmation: true,
    success: true,
    response:
      missionResult.finalResponse ||
      (issues.length > 0
        ? `This plan needs your review before we continue. ${issues.length} issue(s) were found — see the execution plan for details.`
        : 'This plan needs your review before we continue.'),
    hitlReview: {
      provider: 'deepseek',
      issues,
      suggestions,
      confidence: missionResult.review?.confidence,
      risks: missionResult.review?.risks,
      missionId: missionResult.missionId,
    },
  };
}

export async function runDeepSeekMultiAgentPipeline(
  userMessage: string,
  context: DeepSeekIntakeContext = {},
): Promise<MissionResult> {
  const orchestrator = getOrchestrator();
  const result = await orchestrator.processMission(userMessage);

  if (context.missionId && result.missionId !== context.missionId) {
    result.telemetry.missionId = context.missionId;
  }

  return result;
}

function shouldHandleAsPrimary(
  classification: Record<string, unknown>,
  missionResult: MissionResult,
  userMessage: string,
): boolean {
  if (isDeepSeekMultiAgentShadowMode()) return false;

  if (isCompilerSpineIntake(classification, userMessage)) return false;
  if (isCampaignOrLoyaltyMessage(userMessage)) return false;

  if (SETUP_INTENTS.has(missionResult.intent)) return true;
  if (QUERY_INTENTS.has(missionResult.intent)) return true;

  return false;
}

/**
 * Run DeepSeek multi-agent pipeline and optionally short-circuit intake with a response.
 */
export async function integrateDeepSeekMultiAgentIntake(input: {
  userMessage: string;
  classification: Record<string, unknown>;
  missionId?: string | null;
  locale?: string;
  actorId?: string | null;
  storeId?: string | null;
}): Promise<DeepSeekIntakeIntegrationResult> {
  if (!isDeepSeekMultiAgentIntakeEnabled()) {
    return { handled: false, classification: input.classification };
  }

  const userMessage = String(input.userMessage ?? '').trim();
  if (!userMessage) {
    return { handled: false, classification: input.classification };
  }

  // Compiler spine (loyalty / campaign) — never short-circuit; optional shadow compare only.
  if (isCompilerSpineIntake(input.classification, userMessage)) {
    if (!isDeepSeekMultiAgentShadowMode()) {
      return { handled: false, classification: input.classification };
    }
  }

  const missionResult = await runDeepSeekMultiAgentPipeline(userMessage, {
    missionId: input.missionId,
    locale: input.locale,
    actorId: input.actorId,
    storeId: input.storeId,
  });

  const enrichedClassification = mergeDeepSeekShadowIntoClassification(
    input.classification,
    missionResult,
  );

  if (!shouldHandleAsPrimary(input.classification, missionResult, userMessage)) {
    return {
      handled: false,
      classification: enrichedClassification,
      telemetry: {
        deepSeekMissionId: missionResult.missionId,
        deepSeekIntent: missionResult.intent,
        shadowMode: isDeepSeekMultiAgentShadowMode(),
      },
    };
  }

  if (missionResult.status === 'pending_human_review') {
    return {
      handled: true,
      classification: enrichedClassification,
      response: buildHitlResponseFromDeepSeek(missionResult),
      telemetry: missionResult.telemetry,
    };
  }

  if (missionResult.status === 'failed') {
    return {
      handled: false,
      classification: enrichedClassification,
      telemetry: missionResult.telemetry,
    };
  }

  if (QUERY_INTENTS.has(missionResult.intent)) {
    return {
      handled: true,
      classification: enrichedClassification,
      response: buildChatResponseFromDeepSeek(missionResult),
      telemetry: missionResult.telemetry,
    };
  }

  if (SETUP_INTENTS.has(missionResult.intent) && missionResult.plan) {
    if (missionResult.plan.isClarification) {
      return {
        handled: true,
        classification: {
          ...enrichedClassification,
          tool: mapDeepSeekIntentToTool(missionResult.intent),
          executionPath: 'deepseek_multi_agent',
          needsClarification: true,
          missingFields: missionResult.plan.missingFields ?? [],
          parameters: {
            ...(typeof enrichedClassification.parameters === 'object' &&
            enrichedClassification.parameters &&
            !Array.isArray(enrichedClassification.parameters)
              ? enrichedClassification.parameters
              : {}),
            deepSeekMissionId: missionResult.missionId,
            deepSeekIntent: missionResult.intent,
            multiStore: missionResult.plan.multiStore ?? null,
          },
        },
        response: buildClarificationResponseFromDeepSeek(missionResult),
        telemetry: missionResult.telemetry,
      };
    }

    const entities =
      (missionResult.telemetry.qualityMetrics as Record<string, unknown> | undefined) ?? {};

    return {
      handled: true,
      classification: {
        ...enrichedClassification,
        tool: mapDeepSeekIntentToTool(missionResult.intent),
        executionPath: 'deepseek_multi_agent',
        parameters: {
          ...(typeof enrichedClassification.parameters === 'object' &&
          enrichedClassification.parameters &&
          !Array.isArray(enrichedClassification.parameters)
            ? enrichedClassification.parameters
            : {}),
          deepSeekMissionId: missionResult.missionId,
          deepSeekIntent: missionResult.intent,
          ...entities,
        },
      },
      response: buildShowExecutionPlanFromDeepSeek(missionResult, {
        missionId: input.missionId,
        storeId: input.storeId,
      }),
      telemetry: missionResult.telemetry,
    };
  }

  return {
    handled: false,
    classification: enrichedClassification,
    telemetry: missionResult.telemetry,
  };
}

/**
 * Enrich multi_agent dispatch metadata with DeepSeek plan before pipeline creation.
 */
export async function enrichMultiAgentDispatchMetadata(
  metadata: Record<string, unknown>,
  goal: string,
): Promise<Record<string, unknown>> {
  if (!isDeepSeekMultiAgentIntakeEnabled()) {
    return metadata;
  }

  const text = String(goal ?? '').trim();
  if (!text) return metadata;

  try {
    const missionResult = await runDeepSeekMultiAgentPipeline(text);
    const plan = missionResult.plan;
    const deepSeekMeta = buildDeepSeekMissionMetadata(missionResult);

    return {
      ...metadata,
      ...deepSeekMeta,
      goal: text,
      deepSeekOrchestrator: {
        missionId: missionResult.missionId,
        intent: missionResult.intent,
        status: missionResult.status,
        finalResponse: missionResult.finalResponse,
      },
      plan: plan
        ? plan.steps.map((step, index) => ({
            step: index + 1,
            agent: step.action,
            description: step.validation ?? step.action,
            parameters: step.parameters,
          }))
        : metadata.plan,
    };
  } catch (error) {
    console.warn(
      '[deepseekIntakeBridge] enrichMultiAgentDispatchMetadata failed:',
      error instanceof Error ? error.message : String(error),
    );
    return metadata;
  }
}

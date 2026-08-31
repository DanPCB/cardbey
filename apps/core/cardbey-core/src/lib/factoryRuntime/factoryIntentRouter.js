/**
 * Factory intent routing — resolves intents via factoryIntentRegistry.
 */

import { unifiedDispatch } from '../intake/unifiedDispatch.js';
import { isVideoOwnedByCreativeFactory } from '../intake/createVideoOntology.js';
import { appendEvent } from '../missionBlackboard.js';
import { getPrismaClient } from '../prisma.js';
import {
  FACTORY_CONTEXT_KEY,
  FACTORY_STATUS_AWAITING_APPROVAL,
  FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL,
  FACTORY_STATUS_COMPLETED,
  FACTORY_STATUS_FAILED,
  FACTORY_STATUS_RUNNING,
  CREATIVE_ASSET_FACTORY_V1_ID,
} from './factoryConstants.js';
import { resolveFactoryIntent } from './factoryIntentRegistry.js';
import { resolveFactoryRoutingContext } from './factoryRoutingContext.js';
import { resolvePlanFromState } from './factoryApprovalPolicy.js';
import { getFactory } from './factoryRegistry.js';
import {
  emitFactoryRouteAccepted,
  emitFactoryRouteAttempted,
  emitFactoryRouteRejected,
} from './factoryTelemetry.js';

export {
  isCreativeFactoryV1Enabled,
  isCreativeFactoryV2Enabled,
  isCreativeFactoryV3Enabled,
  isCreativeFactoryV4Enabled,
  resolveCreativeFactoryId,
} from './factoryBootstrap.js';

/**
 * @param {string} intentLabel
 * @param {string|null|undefined} userMessage
 */
export function isCreativeFactoryIntent(intentLabel, userMessage) {
  const resolved = resolveFactoryIntent(
    { intentLabel, userMessage },
    { intentLabel, userMessage },
  );
  return Boolean(resolved?.factoryId?.startsWith('creative_asset_factory'));
}

/**
 * @param {string} missionId
 */
export async function loadFactoryExecutionFromMission(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return null;
  try {
    const prisma = getPrismaClient();
    const mission = await prisma.mission.findUnique({
      where: { id: mid },
      select: { context: true },
    });
    const ctx = mission?.context;
    if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
      const bundle = ctx[FACTORY_CONTEXT_KEY];
      if (bundle && typeof bundle === 'object') return bundle;
    }
  } catch {
    return null;
  }
  return null;
}

function isActiveFactoryExecution(existing) {
  if (!existing || typeof existing !== 'object') return false;
  const status = String(existing.status ?? '').trim();
  return (
    status === FACTORY_STATUS_RUNNING ||
    status === FACTORY_STATUS_AWAITING_APPROVAL ||
    status === FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL ||
    status === FACTORY_STATUS_COMPLETED
  );
}

/**
 * @param {{
 *   intentLabel: string;
 *   userMessage?: string|null;
 *   missionId: string;
 *   userId: string;
 *   storeId?: string|null;
 *   tenantId?: string|null;
 *   context?: Record<string, unknown>;
 * }} args
 */
export async function tryRouteFactoryIntent(args) {
  const intentLabel = String(args.intentLabel ?? '').trim();
  const userMessage = typeof args.userMessage === 'string' ? args.userMessage.trim() : '';

  if (!isVideoOwnedByCreativeFactory(userMessage, intentLabel)) {
    const { tryRouteUniversalArtifactIntent } = await import('../artifactFactory/artifactIntentRouter.js');
    const uafRoute = await tryRouteUniversalArtifactIntent(args);
    if (uafRoute) return uafRoute;
  }

  const intent = userMessage || intentLabel || 'factory intent';

  emitFactoryRouteAttempted({
    intentLabel,
    intent,
    missionId: String(args.missionId ?? '').trim() || null,
    userId: String(args.userId ?? '').trim() || null,
  });

  const resolved = resolveFactoryIntent(
    { intentLabel, userMessage, goal: userMessage, message: userMessage },
    args.context ?? {},
  );
  if (!resolved?.factoryId) {
    emitFactoryRouteRejected({
      reason: 'no_factory_match',
      intentLabel,
      intent,
      missionId: String(args.missionId ?? '').trim() || null,
      userId: String(args.userId ?? '').trim() || null,
    });
    return null;
  }

  const routingContext = await resolveFactoryRoutingContext({
    intentLabel,
    userMessage,
    userId: args.userId,
    missionId: args.missionId,
    storeId: args.storeId,
    tenantId: args.tenantId,
    context: args.context,
  });

  if (!routingContext.ok) {
    if (routingContext.code === 'NOT_FACTORY_INTENT') {
      return null;
    }
    if (routingContext.code === 'STORE_SELECTION_REQUIRED') {
      emitFactoryRouteRejected({
        reason: 'store_selection_required',
        factoryId: resolved.factoryId,
        intentLabel,
        intent,
        userId: String(args.userId ?? '').trim() || null,
      });
      return {
        ok: false,
        blocked: true,
        checkpoint: 'store_selection',
        ...routingContext.checkpoint,
        error: {
          code: routingContext.code,
          message: routingContext.message,
        },
      };
    }
    emitFactoryRouteRejected({
      reason: routingContext.code === 'AUTH_REQUIRED' ? 'auth_required' : 'missing_context',
      factoryId: resolved.factoryId,
      intentLabel,
      intent,
      userId: String(args.userId ?? '').trim() || null,
    });
    return {
      ok: false,
      blocked: true,
      error: {
        code: routingContext.code,
        message: routingContext.message,
      },
    };
  }

  const missionId = routingContext.missionId;
  const userId = routingContext.userId;
  const storeId = routingContext.storeId;

  const existing = await loadFactoryExecutionFromMission(missionId);
  if (isActiveFactoryExecution(existing)) {
    const generatedArtifacts = await loadGeneratedArtifactsFromMission(missionId);
    return buildFactoryRouteResult({
      factoryExecution: existing,
      duplicate: true,
      generatedArtifacts,
      factoryId: existing.factoryId,
      missionId,
    });
  }

  const factoryId = resolved.factoryId;

  emitFactoryRouteAccepted({
    factoryId,
    intentLabel,
    intent,
    missionId,
    userId,
    intentRegistryId: resolved.intentId ?? null,
  });

  await emitFactoryIntentRouted({
    factoryId,
    originalIntent: intent,
    missionId,
    userId,
    intentLabel,
    intentRegistryId: resolved.intentId,
  });

  const dispatchResult = await unifiedDispatch(
    {
      type: 'run_factory',
      payload: {
        factoryId,
        intent,
        missionId,
        userId,
        storeId: storeId ?? args.storeId ?? null,
        context: {
          ...(args.context ?? {}),
          storeId: storeId ?? args.storeId ?? args.context?.storeId ?? null,
          userMessage: intent,
          missionId,
          runtimeOwned: true,
          performerRuntimeOwned: true,
        },
      },
    },
    { source: 'intake_v2_unified' },
  );

  const runtimeResult = dispatchResult?.toolResult ?? dispatchResult;

  if (dispatchResult?.status === 'blocked' || runtimeResult?.status === 'blocked') {
    emitFactoryRouteRejected({
      reason: 'runtime_blocked',
      factoryId,
      intentLabel,
      intent,
      missionId,
      userId,
      code: dispatchResult?.code ?? runtimeResult?.blocker?.code ?? 'RUNTIME_BLOCKED',
    });
  }

  const factoryExecution =
    dispatchResult?.factoryExecution ??
    runtimeResult?.output?.factoryExecution ??
    runtimeResult?.output ??
    null;
  const generatedArtifacts = await loadGeneratedArtifactsFromMission(missionId);

  return buildFactoryRouteResult({
    factoryExecution,
    runtimeResult: dispatchResult,
    generatedArtifacts,
    factoryId,
    intent,
    missionId,
    dispatchedVia: 'unified_dispatch',
    executionState: dispatchResult?.executionState ?? null,
  });
}

/** @deprecated alias — use tryRouteFactoryIntent */
export const tryRouteCreativeFactoryIntent = tryRouteFactoryIntent;

async function loadGeneratedArtifactsFromMission(missionId) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return [];
  try {
    const prisma = getPrismaClient();
    const mission = await prisma.mission.findUnique({
      where: { id: mid },
      select: { context: true },
    });
    const ctx = mission?.context;
    if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return [];
    const raw = ctx.generatedArtifacts;
    return Array.isArray(raw) ? raw.filter((a) => a && typeof a === 'object') : [];
  } catch {
    return [];
  }
}

function buildFactoryRouteResult(fields) {
  const factoryExecution = fields.factoryExecution ?? null;
  const status = String(factoryExecution?.status ?? FACTORY_STATUS_FAILED);
  const ok =
    status === FACTORY_STATUS_COMPLETED ||
    status === FACTORY_STATUS_AWAITING_APPROVAL ||
    status === FACTORY_STATUS_AWAITING_FINAL_ASSET_APPROVAL ||
    status === FACTORY_STATUS_RUNNING;
  const definition = getFactory(fields.factoryId ?? factoryExecution?.factoryId ?? '');

  return {
    ok,
    duplicate: Boolean(fields.duplicate),
    missionId: fields.missionId ?? factoryExecution?.missionId ?? null,
    dispatchedVia: fields.dispatchedVia ?? 'unified_dispatch',
    actionType: 'run_factory',
    executionState: fields.executionState ?? null,
    source: 'intake_v2_unified',
    factoryId: fields.factoryId ?? factoryExecution?.factoryId ?? CREATIVE_ASSET_FACTORY_V1_ID,
    factoryExecution,
    generatedArtifacts: fields.generatedArtifacts ?? [],
    runtimeResult: fields.runtimeResult ?? null,
    intent: fields.intent ?? factoryExecution?.intent ?? null,
    status,
    plan: factoryExecution?.plan ?? resolvePlanFromState(factoryExecution ?? {}, definition),
    artifact: factoryExecution?.artifact ?? factoryExecution?.stageOutputs?.artifact_finalize ?? null,
    error: ok ? null : factoryExecution?.error ?? fields.runtimeResult?.error ?? null,
  };
}

async function emitFactoryIntentRouted(fields) {
  const payload = {
    event: 'FACTORY_INTENT_ROUTED',
    factoryId: fields.factoryId,
    originalIntent: fields.originalIntent,
    missionId: fields.missionId,
    userId: fields.userId,
    intentLabel: fields.intentLabel ?? null,
    intentRegistryId: fields.intentRegistryId ?? null,
    runtimeAuthority: true,
  };

  const { recordRuntimeAuthorityPathUsed } = await import(
    '../runtime/performerRuntime/runtimeAuthorityGuard.js'
  );
  recordRuntimeAuthorityPathUsed({
    route: 'factory_intent_router',
    toolName: fields.factoryId,
    userId: fields.userId,
    missionId: fields.missionId,
    source: 'factory_intent_router',
  });

  const mid = String(fields.missionId ?? '').trim();
  if (mid) {
    await appendEvent(mid, 'FACTORY_INTENT_ROUTED', payload, { agentId: 'factory_intent_router' }).catch(
      () => {},
    );
  }
}

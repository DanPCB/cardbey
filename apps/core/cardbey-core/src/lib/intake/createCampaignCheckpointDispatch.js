/**
 * Unified create_campaign → checkpoint pipeline dispatch via Runtime Kernel.
 */

import { ensureStructuredCampaignCheckpointSteps } from '../campaignMission/ensureStructuredCampaignCheckpointSteps.js';
import { executeMission } from '../execution/missionExecutionEngine.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from '../execution/executionNotificationEmitter.js';
import { createMissionPipelineForIntakeRoute } from '../mission/missionCreateWrite.js';
import { getTenantId } from '../missionAccess.js';
import { intakeMessage } from './performerIntakeMessageCatalog.js';
import { RISK } from './intakeToolRegistry.js';
import { UNIFIED_ACTION_TYPES } from '../execution/executionTypes.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{
 *   classification?: { parameters?: Record<string, unknown> } | null;
 *   userMessage?: string;
 *   storeId?: string | null;
 * }} input
 */
export function resolveCreateCampaignHandoffFields(input = {}) {
  const params =
    input.classification?.parameters &&
    typeof input.classification.parameters === 'object' &&
    !Array.isArray(input.classification.parameters)
      ? input.classification.parameters
      : {};

  const storeId = pickString(params.storeId, input.storeId);
  const campaignContext = pickString(
    params.campaignContext,
    params.hint,
    params.goal,
    input.userMessage,
  );
  const sourceTool = pickString(params._sourceTool, params.sourceTool) || 'launch_campaign';

  return { storeId, campaignContext, sourceTool };
}

/**
 * @param {object} deps
 * @returns {Promise<
 *   | { kind: 'auth_required' }
 *   | { kind: 'store_required' }
 *   | { kind: 'mission_create_handled' }
 *   | { kind: 'started'; responseBody: object; telemetry: object }
 *   | { kind: 'failed'; statusCode: number; responseBody: object }
 * >}
 */
export async function dispatchCreateCampaignCheckpointPipeline(deps) {
  const {
    res,
    prisma,
    user,
    actorId,
    locale,
    userMessage,
    cardbeyTraceId,
    auditSource,
    classification,
    storeId: storeIdFromDeps,
    safeJson,
    createMissionPipeline,
  } = deps;

  const { storeId, campaignContext, sourceTool } = resolveCreateCampaignHandoffFields({
    classification,
    userMessage,
    storeId: storeIdFromDeps,
  });

  if (!actorId || !user?.id) {
    return { kind: 'auth_required' };
  }

  if (!storeId) {
    return { kind: 'store_required' };
  }

  const titleSeed = campaignContext ? campaignContext.slice(0, 80) : 'Campaign';
  const tenantId = getTenantId(user) ?? actorId;
  const createResult = await createMissionPipelineForIntakeRoute(res, createMissionPipeline, {
    type: 'launch_campaign',
    title: `Campaign: ${titleSeed}`.slice(0, 180),
    targetType: 'store',
    targetId: storeId,
    targetLabel: null,
    metadata: {
      storeId,
      campaignContext: campaignContext || userMessage,
      goal: campaignContext || userMessage,
      source: auditSource,
      sourceTool,
      cardbeyTraceId,
      locale,
    },
    requiresConfirmation: true,
    executionMode: 'AUTO_RUN',
    tenantId,
    createdBy: actorId,
  });
  if (createResult.handled) {
    return { kind: 'mission_create_handled' };
  }
  const pipeline = createResult.pipeline;

  await ensureStructuredCampaignCheckpointSteps(prisma, pipeline.id, {
    logPrefix: '[CreateCampaignDispatch]',
    locale,
  });

  await emitExecutionNotification(
    EXECUTION_EVENT_TYPES.STARTED,
    { tool: 'create_campaign', path: auditSource, timestamp: Date.now() },
    { missionId: pipeline.id, source: auditSource, executionPath: 'kernel_dispatch' },
  );

  const runResult = await executeMission({
    mode: 'campaign_checkpoint_pipeline',
    prisma,
    user,
    missionId: pipeline.id,
    body: {
      storeId,
      campaignContext: campaignContext || userMessage,
      hint: campaignContext || userMessage,
      locale,
      sourceTool,
      cardbeyTraceId,
    },
    auditSource,
    source: auditSource,
  });

  if (runResult.ok) {
    const responseText =
      runResult.mode === 'checkpoint_pipeline'
        ? intakeMessage('campaignCheckpointStarted', locale)
        : intakeMessage('campaignBuilding', locale);

    return {
      kind: 'started',
      responseBody: {
        success: true,
        action: 'campaign_mission_started',
        response: responseText,
        missionId: runResult.missionId,
        campaignId: runResult.campaignId ?? null,
        promotionId: runResult.promotionId ?? null,
        storeId,
        ...(runResult.mode ? { mode: runResult.mode } : {}),
        campaignMissionSummary: {
          storeId,
          campaignContext: campaignContext || userMessage,
          sourceTool,
          ...(runResult.mode ? { mode: runResult.mode } : {}),
        },
      },
      telemetry: {
        classification: {
          executionPath: 'kernel_dispatch',
          tool: 'create_campaign',
          confidence: 1,
          parameters: {
            storeId,
            campaignContext: campaignContext || userMessage,
            sourceTool,
            _autoSubmit: true,
          },
        },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.STATE_CHANGE,
        result: 'success',
      },
    };
  }

  return {
    kind: 'failed',
    statusCode: Math.min(Math.max(Number(runResult.statusCode) || 500, 400), 599),
    responseBody: {
      success: false,
      action: 'create_campaign_failed',
      message:
        typeof runResult.message === 'string' && runResult.message.trim()
          ? runResult.message
          : 'Campaign setup could not be started.',
      error: typeof runResult.error === 'string' ? runResult.error : 'pipeline_run_failed',
    },
  };
}

/**
 * @param {import('express').Response} res
 * @param {Awaited<ReturnType<typeof dispatchCreateCampaignCheckpointPipeline>>} result
 * @param {{ locale: string; safeJson: Function }} ctx
 */
export async function respondCreateCampaignCheckpointDispatch(res, result, ctx) {
  const { locale, safeJson } = ctx;

  if (result.kind === 'auth_required') {
    await safeJson(
      {
        success: true,
        action: 'chat',
        response: intakeMessage('signInToContinue', locale),
      },
      {
        classification: { executionPath: 'kernel_dispatch', tool: 'create_campaign', confidence: 1 },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: 'auth_required',
      },
    );
    return res;
  }

  if (result.kind === 'store_required') {
    await safeJson(
      {
        success: true,
        action: 'clarify',
        response: intakeMessage('campaignRequiresStore', locale),
        options: [],
      },
      {
        classification: { executionPath: 'kernel_dispatch', tool: 'create_campaign', confidence: 1 },
        validated: true,
        downgraded: true,
        downgradeReason: 'requires_store',
        validationErrors: [],
        riskLevel: RISK.STATE_CHANGE,
        result: 'clarify_store',
      },
    );
    return res;
  }

  if (result.kind === 'mission_create_handled') {
    return res;
  }

  if (result.kind === 'started') {
    await safeJson(result.responseBody, result.telemetry);
    return res;
  }

  if (result.kind === 'compiled') {
    await safeJson(result.responseBody, result.telemetry);
    return res;
  }

  if (result.kind === 'failed') {
    return res.status(result.statusCode).json(result.responseBody);
  }

  return null;
}

/**
 * @param {object} deps
 * @param {string} [auditSource]
 */
export async function runCreateCampaignViaUnifiedDispatch(deps, auditSource) {
  const { unifiedDispatch } = await import('./unifiedDispatch.js');
  const params =
    deps.classification?.parameters &&
    typeof deps.classification.parameters === 'object' &&
    !Array.isArray(deps.classification.parameters)
      ? deps.classification.parameters
      : {};
  const confirmed = params.confirmed === true || params._autoSubmit === true;
  const unifiedResult = await unifiedDispatch(
    {
      type: UNIFIED_ACTION_TYPES.CREATE_CAMPAIGN_CHECKPOINT,
      payload: deps,
    },
    {
      source: auditSource ?? deps.auditSource ?? 'intake_v2_unified',
      confirmed,
    },
  );

  const kind = unifiedResult.dispatchKind;
  if (kind === 'compiled') {
    return {
      kind: 'compiled',
      responseBody: unifiedResult.responseBody ?? {},
      telemetry: unifiedResult.telemetry ?? {},
    };
  }
  if (kind === 'started') {
    return {
      kind: 'started',
      responseBody: unifiedResult.responseBody ?? {},
      telemetry: unifiedResult.telemetry ?? {},
    };
  }
  if (kind === 'auth_required') {
    return { kind: 'auth_required' };
  }
  if (kind === 'store_required') {
    return { kind: 'store_required' };
  }
  if (kind === 'mission_create_handled') {
    return { kind: 'mission_create_handled' };
  }
  if (kind === 'failed') {
    return {
      kind: 'failed',
      statusCode: unifiedResult.statusCode ?? 500,
      responseBody: unifiedResult.responseBody ?? {
        success: false,
        action: 'create_campaign_failed',
        message: unifiedResult.message ?? 'Campaign setup could not be started.',
      },
    };
  }

  return {
    kind: 'failed',
    statusCode: 500,
    responseBody: {
      success: false,
      action: 'create_campaign_failed',
      message: unifiedResult.message ?? 'Campaign setup could not be started.',
      error: unifiedResult.code ?? 'dispatch_failed',
    },
  };
}

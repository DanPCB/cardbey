/**
 * Unified create_store → checkpoint pipeline dispatch via Runtime Kernel.
 * All intake paths use runCreateStoreViaUnifiedDispatch → dispatchCreateStoreViaKernel.
 */

import { parseStructuredStoreCreatePillMessage } from '../intent/storeCreateFastPath.js';
import { ensureStructuredStoreCheckpointSteps } from '../storeMission/ensureStructuredStoreCheckpointSteps.js';
import { executeMission } from '../execution/missionExecutionEngine.js';
import { inferCurrencyFromLocationText } from '../../services/draftStore/currencyInfer.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from '../execution/executionNotificationEmitter.js';
import { createMissionPipelineForIntakeRoute } from '../mission/missionCreateWrite.js';
import { getTenantId } from '../missionAccess.js';
import { intakeMessage } from './performerIntakeMessageCatalog.js';
import { RISK } from './intakeToolRegistry.js';
import { UNIFIED_ACTION_TYPES } from '../execution/executionTypes.js';
import { findDuplicateStoreForUser } from './storeDuplicateDetection.js';
import { FactBuilder } from '../response/factBuilder.js';
import { buildIntakePayloadFromFact } from '../response/intakeFactResponse.js';

function stripQuotes(value) {
  return String(value ?? '')
    .replace(/^[\s"'`\u201c\u201d\u2018\u2019]+|[\s"'`\u201c\u201d\u2018\u2019]+$/g, '')
    .trim();
}

/** @param {import('../prisma.js').PrismaClient} prisma @param {string} userId @param {string} businessName @param {string} [location] */
async function findDuplicateBusinessNameForUser(prisma, userId, businessName, location) {
  return findDuplicateStoreForUser(prisma, { userId, businessName, location });
}

/**
 * @param {{
 *   storeCreateForm?: Record<string, unknown> | null;
 *   classification?: { parameters?: Record<string, unknown> } | null;
 *   userMessage?: string;
 * }} input
 */
export function resolveCreateStoreHandoffFields(input = {}) {
  const form =
    input.storeCreateForm && typeof input.storeCreateForm === 'object' && !Array.isArray(input.storeCreateForm)
      ? input.storeCreateForm
      : null;
  const params =
    input.classification?.parameters &&
    typeof input.classification.parameters === 'object' &&
    !Array.isArray(input.classification.parameters)
      ? input.classification.parameters
      : {};

  let businessName = '';
  let businessType = 'Other';
  let locationTrim = '';
  let intentMode = 'store';

  if (form) {
    businessName = stripQuotes(form.storeName);
    businessType = stripQuotes(form.storeType ?? form.category ?? form.businessType) || 'Other';
    locationTrim = stripQuotes(form.location);
    if (String(form.intentMode ?? '').trim().toLowerCase() === 'website') intentMode = 'website';
  }

  if (!businessName) {
    businessName = stripQuotes(params.storeName ?? params.businessName);
  }
  if (businessType === 'Other') {
    businessType = stripQuotes(params.storeType ?? params.businessType) || 'Other';
  }
  if (!locationTrim) {
    locationTrim = stripQuotes(params.location);
  }
  if (String(params.intentMode ?? '').trim().toLowerCase() === 'website') {
    intentMode = 'website';
  }

  if (!businessName) {
    const pill = parseStructuredStoreCreatePillMessage(String(input.userMessage ?? ''));
    if (pill?.storeName) {
      businessName = stripQuotes(pill.storeName);
      if (pill.category) businessType = stripQuotes(pill.category) || businessType;
      if (pill.location) locationTrim = stripQuotes(pill.location);
      if (pill.intentMode === 'website') intentMode = 'website';
    }
  }

  return { businessName, businessType, locationTrim, intentMode };
}

/**
 * Structured create-store submits (form / pill with `_autoSubmit`) must use the checkpoint
 * pipeline — not the static or dynamic proactive_plan runway.
 *
 * @param {{
 *   classification?: { tool?: string; parameters?: Record<string, unknown> } | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   userMessage?: string;
 * }} input
 */
export function shouldForceCreateStoreCheckpointDispatch(input = {}) {
  const classification = input.classification;
  const tool = String(classification?.tool ?? '').trim();
  if (tool !== 'create_store') return false;

  const params =
    classification?.parameters &&
    typeof classification.parameters === 'object' &&
    !Array.isArray(classification.parameters)
      ? classification.parameters
      : {};
  if (params._autoSubmit !== true) return false;

  const { businessName } = resolveCreateStoreHandoffFields({
    storeCreateForm: input.storeCreateForm,
    classification,
    userMessage: input.userMessage,
  });
  return Boolean(String(businessName ?? '').trim());
}

/**
 * @typedef {{
 *   kind: 'needs_form';
 *   intentMode: 'store' | 'website';
 * }} CreateStoreNeedsFormResult
 * @typedef {{
 *   kind: 'auth_required';
 * }} CreateStoreAuthRequiredResult
 * @typedef {{
 *   kind: 'duplicate';
 *   businessName: string;
 * }} CreateStoreDuplicateResult
 * @typedef {{
 *   kind: 'mission_create_handled';
 * }} CreateStoreMissionCreateHandledResult
 * @typedef {{
 *   kind: 'started';
 *   responseBody: Record<string, unknown>;
 *   telemetry: Record<string, unknown>;
 * }} CreateStoreStartedResult
 * @typedef {{
 *   kind: 'failed';
 *   statusCode: number;
 *   responseBody: Record<string, unknown>;
 * }} CreateStoreFailedResult
 */

/**
 * @param {object} deps
 * @param {import('express').Response} deps.res
 * @param {import('../prisma.js').PrismaClient} deps.prisma
 * @param {{ id: string }} deps.user
 * @param {string | null | undefined} deps.actorId
 * @param {string} deps.locale
 * @param {string} deps.userMessage
 * @param {string | null | undefined} deps.cardbeyTraceId
 * @param {string} deps.auditSource
 * @param {Record<string, unknown> | null | undefined} deps.storeCreateForm
 * @param {{ parameters?: Record<string, unknown> } | null | undefined} deps.classification
 * @param {(body: object, telemetry?: object) => unknown} deps.safeJson
 * @param {(name: string) => object} deps.formatDuplicateResponse
 * @param {(params: object) => Promise<object>} deps.createMissionPipeline
 * @returns {Promise<
 *   CreateStoreNeedsFormResult
 *   | CreateStoreAuthRequiredResult
 *   | CreateStoreDuplicateResult
 *   | CreateStoreMissionCreateHandledResult
 *   | CreateStoreStartedResult
 *   | CreateStoreFailedResult
 * >}
 */
export async function dispatchCreateStoreCheckpointPipeline(deps) {
  const {
    res,
    prisma,
    user,
    actorId,
    locale,
    userMessage,
    cardbeyTraceId,
    auditSource,
    storeCreateForm,
    classification,
    safeJson,
    formatDuplicateResponse,
    createMissionPipeline,
  } = deps;

  const { businessName, businessType, locationTrim, intentMode } = resolveCreateStoreHandoffFields({
    storeCreateForm,
    classification,
    userMessage,
  });
  const ctxIntentMode = intentMode === 'website' ? 'website' : 'store';

  if (!businessName) {
    return { kind: 'needs_form', intentMode: ctxIntentMode };
  }

  if (!actorId || !user?.id) {
    return { kind: 'auth_required' };
  }

  const dup = await findDuplicateBusinessNameForUser(prisma, user.id, businessName, locationTrim);
  if (dup) {
    return {
      kind: 'duplicate',
      businessName: dup.name ?? businessName,
      existingStoreId: dup.id,
      existingStoreName: dup.name ?? businessName,
    };
  }

  const tenantId = getTenantId(user) ?? actorId;
  const titlePrefix = ctxIntentMode === 'website' ? 'Create mini website' : 'Create store';
  const createResult = await createMissionPipelineForIntakeRoute(res, createMissionPipeline, {
    type: 'store',
    title: `${titlePrefix}: ${businessName.slice(0, 120)}`,
    targetType: 'store',
    targetId: undefined,
    targetLabel: undefined,
    metadata: {
      businessName,
      businessType,
      location: locationTrim,
      websiteMode: ctxIntentMode === 'website',
      generateWebsite: ctxIntentMode === 'website',
      intentMode: ctxIntentMode,
      source: auditSource,
      cardbeyTraceId,
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

  await ensureStructuredStoreCheckpointSteps(prisma, pipeline.id, { logPrefix: '[CreateStoreDispatch]' });

  const currencyCode =
    inferCurrencyFromLocationText(locationTrim) || inferCurrencyFromLocationText(businessName) || 'AUD';

  await emitExecutionNotification(
    EXECUTION_EVENT_TYPES.STARTED,
    { tool: 'create_store', path: auditSource, timestamp: Date.now() },
    { missionId: pipeline.id, source: auditSource, executionPath: 'kernel_dispatch' },
  );

  const runResult = await executeMission({
    mode: 'checkpoint_pipeline',
    prisma,
    user,
    missionId: pipeline.id,
    body: {
      businessName,
      businessType,
      location: locationTrim,
      currencyCode,
      intentMode: ctxIntentMode,
      rawUserText: userMessage,
      cardbeyTraceId,
    },
    auditSource,
    source: auditSource,
  });

  if (runResult.ok) {
    const fact = FactBuilder.storeMissionStarted({
      missionId: runResult.missionId,
      storeName: businessName,
      intentMode: ctxIntentMode,
      businessType,
      location: locationTrim,
      mode: runResult.mode,
      jobId: runResult.jobId,
      generationRunId: runResult.generationRunId,
      draftId: runResult.draftId,
    });

    const responseBody = buildIntakePayloadFromFact(fact, { explanation: null }, {
      success: true,
      action: 'store_mission_started',
      missionId: runResult.missionId,
      jobId: runResult.jobId,
      generationRunId: runResult.generationRunId,
      draftId: runResult.draftId,
      intentMode: ctxIntentMode,
      ...(runResult.mode ? { mode: runResult.mode } : {}),
      storeMissionSummary: {
        businessName,
        businessType,
        location: locationTrim,
        ...(runResult.mode ? { mode: runResult.mode } : {}),
      },
    });

    return {
      kind: 'started',
      responseBody,
      telemetry: {
        classification: {
          executionPath: 'kernel_dispatch',
          tool: 'create_store',
          confidence: 1,
          parameters: {
            storeName: businessName,
            location: locationTrim || null,
            storeType: businessType,
            intentMode: ctxIntentMode,
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
      action: 'create_store_failed',
      message:
        typeof runResult.message === 'string' && runResult.message.trim()
          ? runResult.message
          : 'Store setup could not be started.',
      error: typeof runResult.error === 'string' ? runResult.error : 'pipeline_run_failed',
    },
  };
}

/**
 * Map dispatch result to HTTP via safeJson / res.status.
 *
 * @param {import('express').Response} res
 * @param {Awaited<ReturnType<typeof dispatchCreateStoreCheckpointPipeline>>} result
 * @param {object} ctx
 * @param {string} ctx.locale
 * @param {(body: object, telemetry?: object) => unknown} ctx.safeJson
 * @param {(name: string) => object} ctx.formatDuplicateResponse
 * @param {Record<string, unknown>} [ctx.explainContext]
 * @returns {import('express').Response | null} null when caller should continue intake
 */
export async function respondCreateStoreCheckpointDispatch(res, result, ctx) {
  const { locale, safeJson, formatDuplicateResponse, explainContext = {} } = ctx;
  const { explainFactForIntake } = await import('../response/intakeFactResponse.js');
  const { StructuredFact } = await import('../response/factTypes.js');
  const { explainDuplicateStoreIntakeResponse } = await import('./intakeErrorTypes.js');

  if (result.kind === 'needs_form') {
    await safeJson(
      {
        success: true,
        action: 'create_store',
        intentMode: result.intentMode,
      },
      {
        classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: 'success',
      },
    );
    return res;
  }

  if (result.kind === 'auth_required') {
    await safeJson(
      {
        success: true,
        action: 'chat',
        response: intakeMessage('signInAutomatedStore', locale),
      },
      {
        classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: 'auth_required',
      },
    );
    return res;
  }

  if (result.kind === 'duplicate') {
    const duplicatePayload = await explainDuplicateStoreIntakeResponse(
      result.businessName,
      {
        id: result.existingStoreId,
        name: result.existingStoreName ?? result.businessName,
      },
      explainContext,
    );
    await safeJson(
      duplicatePayload,
      {
      classification: { executionPath: 'direct_action', tool: 'create_store', confidence: 1 },
      validated: true,
      downgraded: false,
      validationErrors: [],
      riskLevel: RISK.STATE_CHANGE,
      result: 'duplicate_store',
    },
    );
    return res;
  }

  if (result.kind === 'mission_create_handled') {
    return res;
  }

  if (result.kind === 'started') {
    const body = result.responseBody ?? {};
    const enriched =
      body.fact && typeof body.fact === 'object'
        ? await explainFactForIntake(new StructuredFact(body.fact), explainContext, body)
        : body;
    await safeJson(enriched, result.telemetry);
    return res;
  }

  if (result.kind === 'failed') {
    return res.status(result.statusCode).json(result.responseBody);
  }

  console.warn('[CreateStoreDispatch] unhandled dispatch result kind', result?.kind ?? null);
  if (!res.headersSent) {
    return res.status(500).json({
      success: false,
      action: 'create_store_failed',
      message: 'Store setup could not be started.',
      error: 'unhandled_dispatch_kind',
    });
  }
  return res;
}

/**
 * Route create_store through unified dispatch (single execution router).
 *
 * @param {object} deps - same bag as dispatchCreateStoreCheckpointPipeline
 * @param {string} [auditSource]
 * @returns {Promise<Awaited<ReturnType<typeof dispatchCreateStoreCheckpointPipeline>>>}
 */
export async function runCreateStoreViaUnifiedDispatch(deps, auditSource) {
  const { unifiedDispatch } = await import('./unifiedDispatch.js');
  const unifiedResult = await unifiedDispatch(
    {
      type: UNIFIED_ACTION_TYPES.CREATE_STORE_CHECKPOINT,
      payload: deps,
    },
    { source: auditSource ?? deps.auditSource ?? 'intake_v2_unified' },
  );

  const kind = unifiedResult.dispatchKind;
  if (kind === 'started') {
    return {
      kind: 'started',
      responseBody: unifiedResult.responseBody ?? {},
      telemetry: unifiedResult.telemetry ?? {},
    };
  }
  if (kind === 'needs_form') {
    return { kind: 'needs_form', intentMode: unifiedResult.intentMode ?? 'store' };
  }
  if (kind === 'auth_required') {
    return { kind: 'auth_required' };
  }
  if (kind === 'duplicate') {
    return {
      kind: 'duplicate',
      businessName: unifiedResult.businessName ?? '',
      existingStoreId: unifiedResult.existingStoreId ?? null,
      existingStoreName: unifiedResult.existingStoreName ?? unifiedResult.businessName ?? '',
    };
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
        action: 'create_store_failed',
        message: unifiedResult.message ?? 'Store setup could not be started.',
      },
    };
  }

  return {
    kind: 'failed',
    statusCode: 500,
    responseBody: {
      success: false,
      action: 'create_store_failed',
      message: unifiedResult.message ?? 'Store setup could not be started.',
      error: unifiedResult.code ?? 'dispatch_failed',
    },
  };
}

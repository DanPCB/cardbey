/**
 * Unified create_store → checkpoint pipeline dispatch via Runtime Kernel.
 * All intake paths use runCreateStoreViaUnifiedDispatch → dispatchCreateStoreViaKernel.
 */

import { parseStructuredStoreCreatePillMessage } from '../intent/storeCreateFastPath.js';
import { isExplicitCreateStoreFromUploadContext } from './assetUploadGuard.js';
import {
  buildPerformerStoreSelectionClarify,
  isExplicitGreenfieldCreateStoreIntent,
  loadAccountStoreContext,
} from './accountStoreIntakeGate.js';
import { intentRequiresActiveStoreContext } from './intakePerformerRouting.js';
import { buildStoreCreationDraft } from './storeCreationDraft.js';
import {
  buildOcrHintsFromImageText,
  formatStoreCreationDraftResponseForBundle,
} from './storeCreationDraftAssetBridge.js';
import { resolveStoreCandidateForIntakeTurn } from './resolveStoreCandidateForIntakeTurn.js';
import { buildDocumentExtractionArtifact } from './storeCandidate.js';
import { ensureStructuredStoreCheckpointSteps } from '../storeMission/ensureStructuredStoreCheckpointSteps.js';
import { scheduleDeferredStorePipelineRun } from '../storeMission/deferredStorePipelineRunner.js';
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
import { diagLog, isKernelDispatchDiagEnabled } from '../diagnostics/storeCreationDiagnostics.js';
import { assertKernelAuthorizedExecution } from '../runtime/kernelMandatory.js';
import { resolveBueForCreateStoreDraft } from './createStoreBueProjection.js';
import {
  cleanString,
  normalizePhone,
  normalizeWebsite,
} from '../businessDiscovery/businessDataNormalizer.js';

/**
 * Optional research contact fields for mission metadata / run body (additive).
 * @param {{ websiteUrl?: string, phone?: string, email?: string, ocrText?: string }} fields
 */
export function researchContactFieldsForMissionBody(fields = {}) {
  const websiteUrl = normalizeWebsite(fields.websiteUrl) || cleanString(fields.websiteUrl) || '';
  const phone = normalizePhone(fields.phone) || cleanString(fields.phone) || '';
  const email = cleanString(fields.email) || '';
  const ocrText = cleanString(fields.ocrText) || '';
  return {
    ...(websiteUrl ? { websiteUrl } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(ocrText ? { ocrText, ocrRawText: ocrText } : {}),
  };
}

const INTAKE_ASYNC_PIPELINE_SOURCES = new Set([
  'intake_v2_fresh_store_draft',
  'intake_v2_classified_checkpoint',
  'intake_v2_unified',
]);

/** Intake HTTP must not block on structured_store_build (draft generation runs in background). */
export function shouldDeferStorePipelineExecutionForIntake(auditSource) {
  const source = String(auditSource ?? '').trim();
  if (!source) return false;
  if (INTAKE_ASYNC_PIPELINE_SOURCES.has(source)) return true;
  return source.startsWith('intake_v2_');
}

function buildStoreMissionStartedDispatchResult({
  missionId,
  businessName,
  businessType,
  locationTrim,
  intentMode,
  runResult = {},
}) {
  const fact = FactBuilder.storeMissionStarted({
    missionId,
    storeName: businessName,
    intentMode,
    businessType,
    location: locationTrim,
    mode: runResult.mode ?? 'checkpoint_pipeline',
    jobId: runResult.jobId,
    generationRunId: runResult.generationRunId,
    draftId: runResult.draftId,
  });

  const responseBody = buildIntakePayloadFromFact(fact, { explanation: null }, {
    success: true,
    action: 'store_mission_started',
    missionId,
    jobId: runResult.jobId,
    generationRunId: runResult.generationRunId,
    draftId: runResult.draftId,
    intentMode,
    mode: runResult.mode ?? 'checkpoint_pipeline',
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
          intentMode,
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
 *   intentSourceContext?: Record<string, unknown> | null;
 *   imageContext?: { extractedText?: string } | null;
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
  let websiteUrl = '';
  let phone = '';
  let email = '';
  let ocrText = '';

  if (form) {
    businessName = stripQuotes(form.storeName);
    businessType = stripQuotes(form.storeType ?? form.category ?? form.businessType) || 'Other';
    locationTrim = stripQuotes(form.location);
    if (String(form.intentMode ?? '').trim().toLowerCase() === 'website') intentMode = 'website';
    websiteUrl = stripQuotes(form.websiteUrl ?? form.website);
    phone = stripQuotes(form.phone);
    email = stripQuotes(form.email);
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
  if (!websiteUrl) {
    websiteUrl = stripQuotes(params.websiteUrl ?? params.website);
  }
  if (!phone) {
    phone = stripQuotes(params.phone);
  }
  if (!email) {
    email = stripQuotes(params.email);
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

  const isc =
    input.intentSourceContext && typeof input.intentSourceContext === 'object'
      ? input.intentSourceContext
      : null;
  if (isc) {
    const card =
      isc.cardExtraction && typeof isc.cardExtraction === 'object' ? isc.cardExtraction : null;
    if (!businessName && card) {
      businessName = stripQuotes(card.businessName);
    }
    if (businessType === 'Other' && card) {
      businessType = stripQuotes(card.vertical ?? card.category) || businessType;
    }
    if (!locationTrim && card) {
      locationTrim = stripQuotes(card.location);
    }
    if (!websiteUrl && card) {
      websiteUrl = stripQuotes(card.website ?? card.websiteUrl);
    }
    if (!phone && card) {
      phone = stripQuotes(card.phone);
    }
    if (!email && card) {
      email = stripQuotes(card.email);
    }

    const storeCandidate =
      (isc.storeCandidate && typeof isc.storeCandidate === 'object' ? isc.storeCandidate : null) ??
      (isc.documentExtraction &&
      typeof isc.documentExtraction === 'object' &&
      isc.documentExtraction.storeCandidate &&
      typeof isc.documentExtraction.storeCandidate === 'object'
        ? isc.documentExtraction.storeCandidate
        : null);
    if (storeCandidate) {
      if (!businessName) {
        businessName = stripQuotes(storeCandidate.businessName ?? storeCandidate.name);
      }
      if (!locationTrim) {
        locationTrim = stripQuotes(storeCandidate.location ?? storeCandidate.address);
      }
      if (businessType === 'Other') {
        businessType =
          stripQuotes(storeCandidate.category ?? storeCandidate.vertical) || businessType;
      }
      if (!websiteUrl) {
        websiteUrl = stripQuotes(storeCandidate.website ?? storeCandidate.websiteUrl);
      }
      if (!phone) {
        phone = stripQuotes(storeCandidate.phone);
      }
      if (!email) {
        email = stripQuotes(storeCandidate.email);
      }
    }
  }

  if (!businessName && input.imageContext?.extractedText) {
    const hints = buildOcrHintsFromImageText(input.imageContext.extractedText);
    if (hints?.businessName) businessName = stripQuotes(hints.businessName);
    if (businessType === 'Other' && hints?.businessType) {
      businessType = stripQuotes(hints.businessType) || businessType;
    }
    if (!locationTrim && hints?.location) locationTrim = stripQuotes(hints.location);
  }

  if (!ocrText && input.imageContext?.extractedText) {
    ocrText = cleanString(input.imageContext.extractedText) || '';
  }
  if (!ocrText && isc?.documentExtraction && typeof isc.documentExtraction === 'object') {
    const de = isc.documentExtraction;
    ocrText =
      cleanString(de.ocrText ?? de.ocrRawText ?? de.rawText ?? de.extractedText) || '';
  }

  // Phase 2: STORE_WEBSITE template id (Adaptive = empty)
  let websiteTemplateId = stripQuotes(
    params.websiteTemplateId ?? params.baseWebsiteTemplate ?? input.websiteTemplateId,
  );
  let websiteTemplateSlug = stripQuotes(
    params.baseWebsiteTemplateSlug ?? params.websiteTemplateSlug ?? input.websiteTemplateSlug,
  );
  if (isc) {
    if (!websiteTemplateId) {
      websiteTemplateId = stripQuotes(isc.websiteTemplateId);
      if (!websiteTemplateId && isc.baseWebsiteTemplate && typeof isc.baseWebsiteTemplate === 'object') {
        websiteTemplateId = stripQuotes(isc.baseWebsiteTemplate.id);
      } else if (!websiteTemplateId) {
        websiteTemplateId = stripQuotes(isc.baseWebsiteTemplate);
      }
    }
    if (!websiteTemplateSlug) {
      websiteTemplateSlug = stripQuotes(isc.websiteTemplateSlug);
      if (
        !websiteTemplateSlug &&
        isc.baseWebsiteTemplate &&
        typeof isc.baseWebsiteTemplate === 'object'
      ) {
        websiteTemplateSlug = stripQuotes(isc.baseWebsiteTemplate.slug);
      }
    }
  }

  const normalizedWebsite = normalizeWebsite(websiteUrl) || cleanString(websiteUrl) || '';
  const normalizedPhone = normalizePhone(phone) || cleanString(phone) || '';
  const normalizedEmail = cleanString(email) || '';

  return {
    businessName,
    businessType,
    locationTrim,
    intentMode,
    websiteTemplateId: websiteTemplateId || '',
    websiteTemplateSlug: websiteTemplateSlug || '',
    websiteUrl: normalizedWebsite,
    phone: normalizedPhone,
    email: normalizedEmail,
    ocrText: ocrText || '',
  };
}

/**
 * Skip the dynamic proactive planner for upload create_store until handoff fields resolve.
 *
 * @param {{
 *   classification?: { tool?: string; parameters?: Record<string, unknown> } | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   userMessage?: string;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   imageContext?: { extractedText?: string } | null;
 * }} input
 */
export function shouldSkipDynamicPlannerForUploadCreateStore(input = {}) {
  const tool = String(input.classification?.tool ?? '').trim();
  if (tool !== 'create_store') return false;
  if (
    !isExplicitCreateStoreFromUploadContext({
      userMessage: input.userMessage,
      intentSourceContext: input.intentSourceContext,
    })
  ) {
    return false;
  }
  const { businessName } = resolveCreateStoreHandoffFields(input);
  return !String(businessName ?? '').trim();
}

/**
 * Build create_store draft HTTP payload from upload OCR / client card extraction.
 *
 * @param {object} input
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function buildCreateStoreDraftIntakeResponseFromUpload(input = {}) {
  const userMessage = String(input.userMessage ?? '').trim();
  const intentSourceContext =
    input.intentSourceContext && typeof input.intentSourceContext === 'object'
      ? input.intentSourceContext
      : null;
  if (
    !isExplicitCreateStoreFromUploadContext({
      userMessage,
      intentSourceContext,
    })
  ) {
    return null;
  }

  const { storeCandidate, assetExtraction } = await resolveStoreCandidateForIntakeTurn({
    userMessage,
    intentSourceContext,
    sessionId: input.sessionId ?? null,
    persistedIngest: input.persistedIngest ?? null,
    imageContext: input.imageContext ?? null,
    imageDataUrl: input.imageDataUrl ?? null,
    ocrExtractFn: input.ocrExtractFn ?? null,
  });

  const classification =
    input.classification && typeof input.classification === 'object'
      ? input.classification
      : { tool: 'create_store', parameters: { source: 'upload_ask_selection' } };

  const bundle = buildStoreCreationDraft({
    userMessage,
    classification,
    storeCreateForm: input.storeCreateForm ?? null,
    memoryContext: input.memoryContext ?? null,
    assetExtraction: assetExtraction && typeof assetExtraction === 'object' ? assetExtraction : {},
  });

  const documentExtractionArtifact =
    storeCandidate != null
      ? buildDocumentExtractionArtifact(storeCandidate, {
          missionId: input.missionId ?? undefined,
        })
      : intentSourceContext?.documentExtraction &&
          typeof intentSourceContext.documentExtraction === 'object'
        ? intentSourceContext.documentExtraction
        : null;

  const ocrText =
    (storeCandidate && typeof storeCandidate.rawOcrText === 'string'
      ? storeCandidate.rawOcrText
      : null) ||
    (typeof input.imageContext?.extractedText === 'string'
      ? input.imageContext.extractedText
      : null) ||
    null;

  const bue = await resolveBueForCreateStoreDraft({
    attachmentAnalysis: input.attachmentAnalysis ?? null,
    imageDataUrl:
      input.imageDataUrl ??
      (storeCandidate && typeof storeCandidate.imageDataUrl === 'string'
        ? storeCandidate.imageDataUrl
        : null),
    ocrText,
    userMessage,
    storeName: bundle.draft?.name ?? null,
    missionId: input.missionId ?? null,
    evidenceId:
      intentSourceContext?.evidenceId ??
      input.attachmentAnalysis?.evidenceId ??
      null,
  });

  if (bue.failed) {
    console.warn('[CreateStoreDraft] BUE unavailable; continuing with OCR/StoreCandidate only', {
      reason: bue.reason ?? 'unknown',
    });
  }

  return {
    success: true,
    action: 'create_store',
    intentMode: bundle.intentMode,
    storeCreationDraft: bundle,
    missingFields: bundle.missingFields,
    response: formatStoreCreationDraftResponseForBundle(bundle, {
      documentType: assetExtraction?.documentType,
      source: assetExtraction?.source,
      storeCandidate,
    }),
    businessName: bundle.draft.name ?? undefined,
    businessType: bundle.draft.category ?? undefined,
    imageDataUrl:
      input.imageDataUrl ??
      (storeCandidate && typeof storeCandidate.imageDataUrl === 'string'
        ? storeCandidate.imageDataUrl
        : undefined),
    ...(storeCandidate ? { storeCandidate } : {}),
    ...(documentExtractionArtifact ? { documentExtraction: documentExtractionArtifact } : {}),
    ...(bue.bundle ? { businessUnderstanding: bue.bundle } : {}),
    ...(bue.merchantSummary ? { merchantUnderstandingSummary: bue.merchantSummary } : {}),
    bueStatus: {
      ok: bue.ok,
      reused: bue.reused,
      failed: bue.failed,
      reason: bue.reason ?? null,
      projectedBusinessName: bue.projected?.businessName ?? null,
      projectedConfidence: bue.projected?.confidence ?? null,
    },
  };
}

/**
 * Structured create-store submits (form / pill with `_autoSubmit`) must use the checkpoint
 * pipeline — not the static or dynamic proactive_plan runway.
 *
 * @param {{
 *   classification?: { tool?: string; parameters?: Record<string, unknown> } | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   userMessage?: string;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   imageContext?: { extractedText?: string } | null;
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
    intentSourceContext: input.intentSourceContext,
    imageContext: input.imageContext,
  });
  return Boolean(String(businessName ?? '').trim());
}

/**
 * @typedef {{
 *   kind: 'store_selection_required';
 *   stores: Array<Record<string, unknown>>;
 *   userMessage: string;
 *   lockedTool: string;
 * }} CreateStoreSelectionRequiredResult
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

  const diag = isKernelDispatchDiagEnabled();
  const {
    businessName,
    businessType,
    locationTrim,
    intentMode,
    websiteTemplateId,
    websiteTemplateSlug,
    websiteUrl,
    phone,
    email,
    ocrText,
  } = resolveCreateStoreHandoffFields({
    storeCreateForm,
    classification,
    userMessage,
    intentSourceContext: deps.intentSourceContext,
    imageContext: deps.imageContext,
    websiteTemplateId: deps.websiteTemplateId,
    websiteTemplateSlug: deps.websiteTemplateSlug,
  });
  const ctxIntentMode = intentMode === 'website' ? 'website' : 'store';
  const researchContact = researchContactFieldsForMissionBody({
    websiteUrl,
    phone,
    email,
    ocrText,
  });

  diagLog(diag, '===== Create Store Checkpoint Dispatch =====');
  diagLog(diag, 'Handoff fields:', {
    businessName,
    businessType,
    location: locationTrim,
    intentMode: ctxIntentMode,
    websiteTemplateId: websiteTemplateId || null,
    websiteTemplateSlug: websiteTemplateSlug || null,
    hasWebsiteUrl: Boolean(researchContact.websiteUrl),
    hasPhone: Boolean(researchContact.phone),
    hasEmail: Boolean(researchContact.email),
    hasOcrText: Boolean(researchContact.ocrText),
    auditSource,
    actorId: actorId ?? null,
    userId: user?.id ?? null,
    _autoSubmit: classification?.parameters?._autoSubmit ?? null,
    source: classification?.parameters?.source ?? null,
  });
  const kernelAuthPreview = assertKernelAuthorizedExecution({
    source: auditSource ?? 'intake_v2_unified',
    actionType: 'dispatch_tool',
    userId: user?.id ?? actorId ?? null,
  });
  diagLog(diag, 'Kernel auth preview for auditSource:', {
    auditSource,
    ok: kernelAuthPreview.ok,
    code: kernelAuthPreview.ok ? null : kernelAuthPreview.code,
    message: kernelAuthPreview.ok ? null : kernelAuthPreview.message,
  });

  if (!businessName) {
    const uid = String(user?.id ?? actorId ?? '').trim();
    const explicitGreenfield = isExplicitGreenfieldCreateStoreIntent({
      userMessage,
      classification,
      storeCreateForm,
      intentSourceContext: deps.intentSourceContext,
      primaryModeHint: deps.primaryModeHint,
      primaryMode: deps.primaryMode,
      action: deps.action,
    });
    if (uid && !explicitGreenfield) {
      const { accountHasStores, stores } = await loadAccountStoreContext(uid);
      const lockedTool = String(classification?.tool ?? 'general_chat').trim() || 'general_chat';
      if (accountHasStores) {
        if (intentRequiresActiveStoreContext({ tool: lockedTool })) {
          diagLog(diag, '→ store_selection_required (store-scoped intent, no active store)');
          return {
            kind: 'store_selection_required',
            stores,
            userMessage: String(userMessage ?? '').trim(),
            lockedTool,
          };
        }
        diagLog(diag, '→ intake_chat (vague turn misrouted to create_store)');
        return {
          kind: 'intake_chat',
          message:
            "I didn't quite catch that. You can ask for help, manage campaigns, add products, or create a new business — what would you like to do?",
        };
      }
    }
    diagLog(diag, '→ needs_form (missing businessName)');
    return { kind: 'needs_form', intentMode: ctxIntentMode };
  }

  if (!actorId || !user?.id) {
    diagLog(diag, '→ auth_required', { actorId: actorId ?? null, userId: user?.id ?? null });
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
      ...researchContact,
      ...(websiteTemplateId
        ? {
            websiteTemplateId,
            ...(websiteTemplateSlug ? { websiteTemplateSlug } : {}),
          }
        : {}),
      ...(deps.documentExtraction && typeof deps.documentExtraction === 'object'
        ? {
            documentExtraction: deps.documentExtraction,
            missionContext: {
              documentExtraction:
                deps.documentExtraction.storeCandidate ?? deps.documentExtraction ?? null,
            },
          }
        : {}),
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

  if (deps.documentExtraction?.storeCandidate) {
    try {
      const { persistDocumentExtractionToMission } = await import('./storeCandidate.js');
      const artifact = {
        ...deps.documentExtraction,
        missionId: pipeline.id,
        updatedAt: new Date().toISOString(),
      };
      await persistDocumentExtractionToMission(prisma, pipeline.id, artifact);
    } catch {
      /* non-fatal */
    }
  }

  const currencyCode =
    inferCurrencyFromLocationText(locationTrim) || inferCurrencyFromLocationText(businessName) || 'AUD';

  await emitExecutionNotification(
    EXECUTION_EVENT_TYPES.STARTED,
    { tool: 'create_store', path: auditSource, timestamp: Date.now() },
    { missionId: pipeline.id, source: auditSource, executionPath: 'kernel_dispatch' },
  );

  diagLog(diag, 'Calling executeMission(checkpoint_pipeline)...', {
    missionId: pipeline.id,
    auditSource,
    source: auditSource,
    deferForIntake: shouldDeferStorePipelineExecutionForIntake(auditSource),
  });

  const missionRunBody = {
    businessName,
    businessType,
    location: locationTrim,
    currencyCode,
    intentMode: ctxIntentMode,
    rawUserText: userMessage,
    cardbeyTraceId,
    ...researchContact,
    ...(websiteTemplateId
      ? {
          websiteTemplateId,
          ...(websiteTemplateSlug ? { websiteTemplateSlug } : {}),
        }
      : {}),
  };

  if (shouldDeferStorePipelineExecutionForIntake(auditSource)) {
    // Persist run request + background execute. Soft failures mark mission failed;
    // Render restart resumes via resumeOrphanedDeferredStorePipelines.
    await scheduleDeferredStorePipelineRun({
      prisma,
      user,
      missionId: pipeline.id,
      body: missionRunBody,
      auditSource,
      source: auditSource,
    });

    return buildStoreMissionStartedDispatchResult({
      missionId: pipeline.id,
      businessName,
      businessType,
      locationTrim,
      intentMode: ctxIntentMode,
      runResult: { mode: 'checkpoint_pipeline', missionId: pipeline.id },
    });
  }

  let runResult;
  try {
    runResult = await executeMission({
      mode: 'checkpoint_pipeline',
      prisma,
      user,
      missionId: pipeline.id,
      body: missionRunBody,
      auditSource,
      source: auditSource,
    });
  } catch (err) {
    console.error('[CreateStoreDispatch] executeMission threw:', err?.message ?? err);
    return {
      kind: 'failed',
      statusCode: 500,
      responseBody: {
        success: false,
        action: 'create_store_failed',
        message:
          typeof err?.message === 'string' && err.message.trim()
            ? err.message.trim()
            : 'Store setup could not be started.',
        error: 'pipeline_run_threw',
      },
    };
  }

  diagLog(diag, 'executeMission(checkpoint_pipeline) result:', {
    ok: runResult.ok,
    statusCode: runResult.statusCode ?? null,
    error: runResult.error ?? null,
    message: runResult.message ?? null,
    missionId: runResult.missionId ?? pipeline.id,
    executionPath: runResult.executionPath ?? null,
  });

  if (runResult.ok) {
    return buildStoreMissionStartedDispatchResult({
      missionId: runResult.missionId ?? pipeline.id,
      businessName,
      businessType,
      locationTrim,
      intentMode: ctxIntentMode,
      runResult,
    });
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
 * Build canonical create_store draft payload when checkpoint dispatch needs the inline form.
 *
 * @param {{
 *   userMessage?: string;
 *   intentMode?: 'store' | 'website';
 *   classification?: { parameters?: Record<string, unknown> } | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   memoryContext?: Record<string, unknown> | null;
 * }} input
 */
export function buildNeedsFormCreateStoreIntakeBody(input = {}) {
  const userMessage = String(input.userMessage ?? '').trim();
  const intentMode = input.intentMode === 'website' ? 'website' : 'store';
  const bundle = buildStoreCreationDraft({
    userMessage,
    classification:
      input.classification && typeof input.classification === 'object'
        ? input.classification
        : { tool: 'create_store', parameters: { source: 'needs_form' } },
    storeCreateForm: input.storeCreateForm ?? null,
    memoryContext: input.memoryContext ?? null,
  });
  return {
    success: true,
    action: 'create_store',
    intentMode: bundle.intentMode ?? intentMode,
    storeCreationDraft: bundle,
    missingFields: bundle.missingFields,
    response: formatStoreCreationDraftResponseForBundle(bundle, {
      source: bundle.draft?.source,
    }),
    businessName: bundle.draft.name ?? undefined,
    businessType: bundle.draft.category ?? undefined,
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

  if (result.kind === 'intake_chat') {
    await safeJson(
      {
        success: true,
        action: 'chat',
        response:
          result.message ??
          "I didn't quite catch that. You can ask for help, manage campaigns, add products, or create a new business — what would you like to do?",
        executionPath: 'direct_action',
      },
      {
        classification: {
          executionPath: 'chat',
          tool: 'general_chat',
          confidence: 1,
        },
        validated: true,
        downgraded: false,
        validationErrors: [],
        riskLevel: RISK.SAFE_READ,
        result: 'intake_chat',
      },
    );
    return res;
  }

  if (result.kind === 'store_selection_required') {
    const clarifyBody = buildPerformerStoreSelectionClarify({
      stores: result.stores ?? [],
      userMessage: result.userMessage ?? ctx.userMessage,
      lockedTool: result.lockedTool ?? 'general_chat',
    });
    await safeJson(clarifyBody, {
      classification: {
        executionPath: 'clarify',
        tool: result.lockedTool ?? 'general_chat',
        confidence: 1,
      },
      validated: true,
      downgraded: false,
      validationErrors: [],
      riskLevel: RISK.SAFE_READ,
      result: 'store_selection_required',
    });
    return res;
  }

  if (result.kind === 'needs_form') {
    const uploadDraft =
      ctx.uploadDraftContext && typeof ctx.uploadDraftContext === 'object'
        ? await buildCreateStoreDraftIntakeResponseFromUpload(ctx.uploadDraftContext)
        : null;
    const draftContext =
      ctx.uploadDraftContext && typeof ctx.uploadDraftContext === 'object'
        ? ctx.uploadDraftContext
        : {};
    await safeJson(
      uploadDraft ??
        buildNeedsFormCreateStoreIntakeBody({
          userMessage: draftContext.userMessage ?? ctx.userMessage,
          intentMode: result.intentMode,
          classification: draftContext.classification,
          storeCreateForm: draftContext.storeCreateForm,
          memoryContext: draftContext.memoryContext,
        }),
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
    let enriched = body;
    try {
      enriched =
        body.fact && typeof body.fact === 'object'
          ? await explainFactForIntake(new StructuredFact(body.fact), explainContext, body)
          : body;
    } catch (explainErr) {
      console.warn(
        '[CreateStoreDispatch] explainFactForIntake failed (returning base payload):',
        explainErr?.message ?? explainErr,
      );
    }
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
  const diag = isKernelDispatchDiagEnabled();
  const resolvedSource = auditSource ?? deps.auditSource ?? 'intake_v2_unified';
  diagLog(diag, '===== runCreateStoreViaUnifiedDispatch =====');
  diagLog(diag, 'auditSource:', resolvedSource);
  diagLog(diag, 'CREATE_STORE_CHECKPOINT payload keys:', Object.keys(deps ?? {}));

  const { unifiedDispatch } = await import('./unifiedDispatch.js');
  const unifiedResult = await unifiedDispatch(
    {
      type: UNIFIED_ACTION_TYPES.CREATE_STORE_CHECKPOINT,
      payload: deps,
    },
    { source: resolvedSource },
  );

  diagLog(diag, 'unifiedDispatch(CREATE_STORE_CHECKPOINT) result:', {
    ok: unifiedResult.ok,
    status: unifiedResult.status,
    dispatchKind: unifiedResult.dispatchKind,
    code: unifiedResult.code ?? null,
    message: unifiedResult.message ?? null,
    statusCode: unifiedResult.statusCode ?? null,
    executionPath: unifiedResult.executionPath ?? null,
  });

  const kind = unifiedResult.dispatchKind;
  if (kind === 'started') {
    return {
      kind: 'started',
      responseBody: unifiedResult.responseBody ?? {},
      telemetry: unifiedResult.telemetry ?? {},
    };
  }
  if (kind === 'store_selection_required') {
    return {
      kind: 'store_selection_required',
      stores: unifiedResult.stores ?? [],
      userMessage: unifiedResult.userMessage ?? '',
      lockedTool: unifiedResult.lockedTool ?? 'general_chat',
    };
  }
  if (kind === 'intake_chat') {
    return {
      kind: 'intake_chat',
      message: unifiedResult.message ?? null,
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

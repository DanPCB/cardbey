/**
 * Early create_store dispatch for fresh store missions — bypasses memory/planner/classifier.
 */
import { getPrismaClient } from '../prisma.js';
import { validateCreateStorePayload } from './intakeSystemShortcuts.js';
import {
  findUnknownStoreCreateFormFields,
  validateCreateStoreIntakeSource,
} from './createStoreIntakeMetadata.js';
import { formatValidationErrorResponse, formatDuplicateStoreIntakeResponse } from './intakeErrorTypes.js';
import {
  isStoreCreationDraftConfirmationSubmit,
  resolveStoreCreateFormFromDraftSubmitBody,
} from './storeCreationDraft.js';
import { findDuplicateStoreForUser } from './storeDuplicateDetection.js';
import {
  respondCreateStoreCheckpointDispatch,
  runCreateStoreViaUnifiedDispatch,
} from './createStoreCheckpointDispatch.js';
import { isFreshStoreCreationMission } from './intakePayloadGuard.js';
import { diagLog, isIntakeDiagEnabled, isKernelDispatchDiagEnabled } from '../diagnostics/storeCreationDiagnostics.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   body: Record<string, unknown>;
 *   locale: string;
 *   cardbeyTraceId: string;
 *   resolveActorId: (req: import('express').Request) => string | null;
 *   resolveUserLike: (req: import('express').Request) => object | null;
 * }} ctx
 * @returns {Promise<boolean>} true when response was sent
 */
export async function handleFreshStoreCreationDraftSubmit(req, res, ctx) {
  const { body, locale, cardbeyTraceId, resolveActorId, resolveUserLike } = ctx;
  const diag = isIntakeDiagEnabled() || isKernelDispatchDiagEnabled();

  diagLog(diag, '===== Fresh Store Creation Fast Path =====');
  diagLog(diag, 'isFreshStoreCreationMission:', isFreshStoreCreationMission(body));
  diagLog(diag, 'isStoreCreationDraftConfirmationSubmit:', isStoreCreationDraftConfirmationSubmit(body));
  diagLog(diag, '_autoSubmit:', body._autoSubmit);

  if (!isFreshStoreCreationMission(body) || !isStoreCreationDraftConfirmationSubmit(body)) {
    diagLog(diag, '→ skip fast path (not a draft confirmation submit)');
    return false;
  }
  if (body._autoSubmit !== true) {
    diagLog(diag, '→ skip fast path (_autoSubmit !== true)');
    return false;
  }

  const intakeSource = body.source ?? body.intentSource;
  const sourceError = validateCreateStoreIntakeSource(intakeSource);
  if (sourceError) {
    res.status(400).json(formatValidationErrorResponse([sourceError]));
    return true;
  }

  let storeCreateForm =
    body.storeCreateForm && typeof body.storeCreateForm === 'object' && !Array.isArray(body.storeCreateForm)
      ? { ...body.storeCreateForm }
      : undefined;

  const draftFormEnvelope = resolveStoreCreateFormFromDraftSubmitBody(body.storeCreationDraft, {
    intentMode:
      storeCreateForm && typeof storeCreateForm.intentMode === 'string'
        ? storeCreateForm.intentMode
        : 'store',
  });
  if (draftFormEnvelope) {
    storeCreateForm = { ...(storeCreateForm ?? {}), ...draftFormEnvelope };
  }

  if (!storeCreateForm) {
    return false;
  }

  const unknownFormFields = findUnknownStoreCreateFormFields(storeCreateForm);
  if (unknownFormFields.length > 0) {
    res.status(400).json(
      formatValidationErrorResponse(
        unknownFormFields.map((field) => ({
          field: `storeCreateForm.${field}`,
          message: `Unknown store field: ${field}`,
          code: 'UNKNOWN_STORE_FIELD',
        })),
      ),
    );
    return true;
  }

  const formValidationErrors = validateCreateStorePayload({
    storeCreateForm,
    storeName: storeCreateForm.storeName,
    location: storeCreateForm.location,
    category:
      storeCreateForm.category ?? storeCreateForm.storeType ?? storeCreateForm.businessType,
  });
  if (formValidationErrors.length > 0) {
    res.status(400).json(formatValidationErrorResponse(formValidationErrors));
    return true;
  }

  const userMessage = String(body.userMessage ?? body.text ?? body.goal ?? body.message ?? '').trim();
  const storeName = String(storeCreateForm.storeName ?? storeCreateForm.businessName ?? '').trim();
  const storeType = String(
    storeCreateForm.storeType ?? storeCreateForm.category ?? storeCreateForm.businessType ?? '',
  ).trim();
  const location = String(storeCreateForm.location ?? '').trim();
  const intentMode =
    String(storeCreateForm.intentMode ?? 'store').trim().toLowerCase() === 'website' ? 'website' : 'store';

  const classification = {
    executionPath: 'proactive_plan',
    tool: 'create_store',
    confidence: 1,
    parameters: {
      storeName,
      storeType,
      category: storeType,
      location,
      intentMode,
      _autoSubmit: true,
      source: 'store_creation_draft',
    },
  };

  const classifiedActorId = resolveActorId(req);
  const classifiedUser = resolveUserLike(req);
  const prismaClassified = getPrismaClient();

  const dup = await findDuplicateStoreForUser(prismaClassified, {
    userId: classifiedUser?.id ?? req.user?.id,
    businessName: storeName,
    location,
  });
  if (dup) {
    const { explainDuplicateStoreIntakeResponse } = await import('./intakeErrorTypes.js');
    const payload = await explainDuplicateStoreIntakeResponse(storeName, dup, {
      userId: classifiedUser?.id ?? req.user?.id ?? null,
      storeName,
    });
    res.json(payload);
    return true;
  }

  const { createMissionPipeline } = await import('../missionPipelineService.js');

  const minimalSafeJson = async (payload) => {
    if (!res.headersSent) {
      res.json(payload);
    }
    return res;
  };

  const classifiedDispatch = await runCreateStoreViaUnifiedDispatch(
    {
      res,
      prisma: prismaClassified,
      user: classifiedUser ?? req.user,
      actorId: classifiedActorId,
      locale,
      userMessage,
      cardbeyTraceId,
      auditSource: 'intake_v2_fresh_store_draft',
      storeCreateForm,
      classification,
      safeJson: minimalSafeJson,
      formatDuplicateResponse: formatDuplicateStoreIntakeResponse,
      createMissionPipeline,
    },
    'intake_v2_fresh_store_draft',
  );

  diagLog(diag, 'runCreateStoreViaUnifiedDispatch result kind:', classifiedDispatch?.kind ?? null);
  if (classifiedDispatch?.kind === 'failed') {
    diagLog(diag, '❌ create store failed:', classifiedDispatch.responseBody ?? null);
  }

  const responded = await respondCreateStoreCheckpointDispatch(res, classifiedDispatch, {
    locale,
    safeJson: minimalSafeJson,
    formatDuplicateResponse: formatDuplicateStoreIntakeResponse,
    explainContext: {
      userId: classifiedUser?.id ?? req.user?.id ?? null,
      storeName,
    },
  });
  return Boolean(responded);
}

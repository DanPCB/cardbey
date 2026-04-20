/**
 * Shared build_store job logic for orchestra/start and /api/business/create.
 * Exports createBuildStoreJob and runBuildStoreJob so both routes stay thin.
 */

import crypto from 'crypto';
import { generateDraft, getDraftByGenerationRunId } from './draftStoreService.js';
import { captureIngestSample, extractDomain } from '../contentIngest/captureSample.js';
import { mapErrorToDraftFailure } from '../errors/mapErrorToDraftFailure.js';
import { transitionOrchestratorTaskStatus } from '../../kernel/transitions/transitionService.js';
import { inferCurrencyFromLocationText } from './currencyInfer.js';

function newTraceId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * Deep-merge draftInput patch onto factory base draft input (plain objects only).
 * Arrays and non-objects replace; nested objects merge recursively.
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} patch
 */
export function mergeDraftInputAfterBase(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ...base };
  }
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const p = patch[key];
    const b = base[key];
    if (
      p != null &&
      typeof p === 'object' &&
      !Array.isArray(p) &&
      b != null &&
      typeof b === 'object' &&
      !Array.isArray(b)
    ) {
      out[key] = mergeDraftInputAfterBase(/** @type {Record<string, unknown>} */ (b), /** @type {Record<string, unknown>} */ (p));
    } else {
      out[key] = p;
    }
  }
  return out;
}

function logMemoryUsage(scope, extra = {}) {
  const heapUsedMb = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
  console.log('[MEM]', heapUsedMb, 'MB', scope, extra);
}

/**
 * Run build_store job: generate draft and mark task completed/failed.
 * Idempotent and concurrency-safe; call from orchestra/start (auto-run) and job/:id/run.
 * Uses updateMany + count so "lost race" (count === 0) is exit-quietly, not 500/failed.
 * @param {object} [options] - optional { missionContext, emitContextUpdate, stepReporter, reactMissionId, originSurface } for Foundation 2 / store pipeline
 */
export function runBuildStoreJob(prisma, jobId, draftId, generationRunId, traceId = newTraceId(), options = {}) {
  const cardbeyTraceId = options.cardbeyTraceId ?? null;
  const log = (msg, data = {}) => {
    console.log(`[runBuildStoreJob] ${msg}`, {
      traceId,
      cardbeyTraceId,
      jobId,
      draftId,
      generationRunId,
      ...data,
    });
  };
  log('invoked', { originSurface: options.originSurface ?? 'unknown' });
  logMemoryUsage('build_store_job_start', { jobId, draftId, generationRunId });

  setImmediate(async () => {
    let didTransitionToRunning = false;
    const markFailed = async (errorCode, messageOrResult) => {
      const resultPayload = typeof messageOrResult === 'string'
        ? { ok: false, error: errorCode, errorCode, message: messageOrResult, generationRunId }
        : { ok: false, errorCode, ...messageOrResult, generationRunId };
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'failed',
        fromStatus: 'running',
        actorType: 'worker',
        correlationId: generationRunId,
        reason: 'BUILD_STORE_JOB',
        result: resultPayload,
      }).catch(() => {});
    };

    try {
      const task = await prisma.orchestratorTask.findUnique({ where: { id: jobId } }).catch(() => null);
      if (!task) {
        log('task not found, skipping');
        return;
      }
      const status = (task.status || '').toLowerCase();
      if (status === 'running' || status === 'completed') {
        log('task already running or completed, idempotent skip');
        return;
      }

      // Atomic transition: updateMany so count === 0 means "lost race or not queued" — exit quietly (no 500, no mark failed)
      const tr = await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'running',
        fromStatus: 'queued',
        actorType: 'worker',
        correlationId: generationRunId,
        reason: 'BUILD_STORE_JOB',
      });
      if (!tr.ok) {
        log('atomic update count 0 (someone else running or not queued), exit quietly');
        return;
      }
      didTransitionToRunning = true;

      const draft = await prisma.draftStore.findUnique({ where: { id: draftId } }).catch(() => null);
      if (!draft) {
        log('draft not found, failing task');
        await markFailed('draft_not_found', { error: 'draft_not_found', errorCode: 'STORE_NOT_FOUND' });
        return;
      }

      const draftStatus = (draft.status || '').toLowerCase();
      if (draftStatus === 'ready') {
        log('draft already ready, marking task completed');
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'completed',
          fromStatus: 'running',
          actorType: 'worker',
          correlationId: generationRunId,
          reason: 'BUILD_STORE_JOB',
          result: { ok: true, generationRunId, draftId },
        }).catch(() => {});
        return;
      }
      if (draftStatus === 'committed') {
        log('draft already committed, marking task completed');
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'completed',
          fromStatus: 'running',
          actorType: 'worker',
          correlationId: generationRunId,
          reason: 'BUILD_STORE_JOB',
          result: { ok: true, generationRunId, draftId, note: 'draft_already_committed' },
        }).catch(() => {});
        return;
      }
      if (draftStatus === 'failed') {
        log('draft in failed state, failing task');
        const failedDraft = await prisma.draftStore.findUnique({ where: { id: draftId }, select: { error: true, errorCode: true, recommendedAction: true } }).catch(() => null);
        const payload = {
          error: failedDraft?.error || 'draft_failed',
          errorCode: failedDraft?.errorCode || 'INTERNAL_ERROR',
          recommendedAction: failedDraft?.recommendedAction || 'retry',
        };
        await markFailed('draft_failed', payload);
        return;
      }
      if (draftStatus !== 'generating') {
        log('draft invalid status, failing task', { status: draftStatus });
        await markFailed('draft_invalid_status', { error: 'draft_invalid_status', errorCode: 'VALIDATION_ERROR', status: draftStatus });
        return;
      }

      const input = draft.input && typeof draft.input === 'object' && !Array.isArray(draft.input) ? draft.input : {};
      const request = task.request && typeof task.request === 'object' ? task.request : {};
      const displayName =
        [input.businessName, input.storeName, request.businessName, request.storeName]
          .map((s) => (s != null && String(s).trim() ? String(s).trim() : ''))
          .find(Boolean) || '';
      const planLocation = input.location ?? request.location ?? '';
      const planStoreType =
        input.storeType ?? input.businessType ?? request.businessType ?? request.requestBusinessType ?? '';
      const planIntentMode = String(
        input.intentMode ?? request.intentMode ?? 'store',
      ).toLowerCase();
      const rawUserText = input.prompt ?? request.rawInput ?? request.rawUserText ?? null;
      const planFieldsPresent = [
        displayName ? 'displayName' : null,
        planLocation && String(planLocation).trim() ? 'location' : null,
        planStoreType && String(planStoreType).trim() ? 'storeType' : null,
        planIntentMode ? 'intentMode' : null,
        rawUserText != null && String(rawUserText).trim() ? 'rawUserText' : null,
      ].filter(Boolean);
      log('execution plan coverage', {
        originSurface: options.originSurface ?? 'unknown',
        draftMode: draft.mode ?? null,
        planFieldsPresent,
        hasDisplayName: !!displayName,
      });
      const strictPlan =
        process.env.STRICT_BUILD_STORE_PLAN === 'true' || process.env.STRICT_BUILD_STORE_PLAN === '1';
      if (strictPlan && String(draft.mode || '').toLowerCase() === 'ai') {
        const hasText = rawUserText != null && String(rawUserText).trim().length > 0;
        const hasName = displayName.length > 0;
        if (!hasText && !hasName) {
          log('strict plan gate: missing name and raw text for ai mode', { originSurface: options.originSurface ?? 'unknown' });
          await markFailed('build_plan_incomplete', {
            error: 'build_plan_incomplete',
            errorCode: 'VALIDATION_ERROR',
            message: 'AI store build requires businessName (or storeName) and/or raw user prompt on draft/task',
          });
          return;
        }
      }

      await options.stepReporter?.started?.('catalog').catch(() => {});

      /** Prefer explicit pipeline id from caller (store POST /run) before task row is re-read with missionId. */
      const missionIdForReact = options.reactMissionId ?? task.missionId ?? jobId;
      // Optional ReAct step ordering only — not Performer Intake V2. Gated off unless USE_LLM_TASK_PLANNER=true.
      if (process.env.USE_LLM_TASK_PLANNER === 'true') {
        try {
          const { mergeMissionContext } = await import('../../lib/mission.js');
          const { planMission } = await import('../react/missionPlanner.ts');
          const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
          const { BUILD_STORE_REACT_TOOLS } = await import('../react/buildStoreReactTools.ts');
          const intent = String(request.rawInput || input.prompt || request.goal || 'build_store').slice(0, 2000);
          const businessContext = {
            businessName: request.businessName ?? input.businessName ?? null,
            goal: request.goal ?? null,
            sourceType: request.sourceType ?? null,
            websiteUrl: request.websiteUrl ?? null,
          };
          const plan = await planMission(intent, businessContext, [...BUILD_STORE_REACT_TOOLS], llmGateway);
          if (plan && missionIdForReact) {
            await mergeMissionContext(
              missionIdForReact,
              { react_plan: plan },
              { prisma }
            ).catch(() => {});
            const planLine = `PLAN: ${plan.reasoning}`;
            if (typeof options.emitContextUpdate === 'function') {
              await options.emitContextUpdate({
                reasoning_line: { line: planLine, timestamp: Date.now() },
              }).catch(() => {});
            } else {
              const row = await prisma.mission.findUnique({ where: { id: missionIdForReact }, select: { context: true } }).catch(() => null);
              const ctx = row?.context && typeof row.context === 'object' ? row.context : {};
              const prevLog = Array.isArray(ctx.reasoning_log) ? ctx.reasoning_log : [];
              await mergeMissionContext(
                missionIdForReact,
                { reasoning_log: [...prevLog, planLine] },
                { prisma }
              ).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[runBuildStoreJob] planMission skipped:', e?.message || e);
          // Planner failure should not mean an empty blackboard: emit a single warning reasoning line, then continue standard build.
          const warnLine = '⚠ Task planner unavailable — running standard build';
          try {
            if (typeof options.emitContextUpdate === 'function') {
              await options.emitContextUpdate({
                reasoning_line: { line: warnLine, timestamp: Date.now() },
              }).catch(() => {});
            } else if (missionIdForReact) {
              const { mergeMissionContext } = await import('../../lib/mission.js');
              const row = await prisma.mission.findUnique({ where: { id: missionIdForReact }, select: { context: true } }).catch(() => null);
              const ctx = row?.context && typeof row.context === 'object' ? row.context : {};
              const prevLog = Array.isArray(ctx.reasoning_log) ? ctx.reasoning_log : [];
              await mergeMissionContext(
                missionIdForReact,
                { reasoning_log: [...prevLog, warnLine] },
                { prisma }
              ).catch(() => {});
            }
          } catch {
            /* non-fatal */
          }
        }
      }

      log('calling generateDraft');
      console.log('[runBuildStoreJob] pre-generateDraft', {
        reactMissionId: missionIdForReact ?? 'MISSING',
        hasEmitContextUpdate: typeof options.emitContextUpdate === 'function',
      });
      await generateDraft(draft.id, {
        userId: task.userId || null,
        missionContext: options.missionContext ?? null,
        emitContextUpdate: options.emitContextUpdate,
        stepReporter: options.stepReporter ?? null,
        reactMissionId: missionIdForReact,
      });
      const draftAfter = await prisma.draftStore.findUnique({ where: { id: draftId }, select: { status: true } }).catch(() => null);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[runBuildStoreJob] finishing', {
          jobId,
          draftId,
          generationRunId,
          statusAfterDraft: draftAfter?.status ?? 'unknown',
        });
      }
      log('generateDraft done, marking task completed');
      await options.stepReporter?.completed?.('catalog').catch(() => {});
      if (typeof options.emitContextUpdate === 'function') {
        await options
          .emitContextUpdate({
            reasoning_line: { line: '✓ Store draft ready — finalising', timestamp: Date.now() },
          })
          .catch(() => {});
      }

      // Content ingest (dev-gated): capture after success; best-effort, never block
      // Uses `request` from task.request (parsed once near start of job body).
      const updatedDraft = await prisma.draftStore.findUnique({
        where: { id: draftId },
        select: { preview: true, input: true, mode: true },
      }).catch(() => null);
      if (updatedDraft?.preview) {
        const preview = updatedDraft.preview && typeof updatedDraft.preview === 'object' ? updatedDraft.preview : {};
        const input = (updatedDraft.input && typeof updatedDraft.input === 'object') ? updatedDraft.input : {};
        const catalog = {
          categories: preview.categories ?? [],
          items: preview.items ?? [],
        };
        const reqContext = {
          goal: request.goal ?? 'build_store',
          sourceType: request.sourceType ?? null,
          includeImages: request.includeImages !== false,
          generationRunId: request.generationRunId ?? generationRunId ?? null,
          templateKey: request.templateKey ?? null,
          websiteUrl: request.websiteUrl ?? null,
          rawInput: request.rawInput ?? input.prompt ?? null,
          ocrRawText: input.ocrRawText ?? null,
        };
        await captureIngestSample({
          reqContext,
          draftId,
          jobId,
          catalog,
          mode: updatedDraft.mode ?? draft.mode ?? 'ai',
          vertical: input.vertical ?? request.requestBusinessType ?? request.businessType ?? null,
          previewMeta: preview.meta ?? null,
        }).catch(() => {});
        if (typeof options.emitContextUpdate === 'function') {
          await options
            .emitContextUpdate({
              reasoning_line: { line: '✓ Content indexed', timestamp: Date.now() },
            })
            .catch(() => {});
        }
      }

      // Wipe full websiteUrl from task.request after success (gated) to reduce privacy footprint
      const wipeWebsiteUrl = process.env.CONTENT_INGEST_WIPE_WEBSITE_URL === 'true' || process.env.CONTENT_INGEST_WIPE_WEBSITE_URL === '1';
      const isUrlBuild = (request.goal || '').toLowerCase() === 'build_store_from_website' || (request.sourceType || '').toLowerCase() === 'url';
      if (wipeWebsiteUrl && isUrlBuild && request.websiteUrl) {
        const domain = extractDomain(request.websiteUrl);
        if (domain) {
          try {
            await prisma.orchestratorTask.update({
              where: { id: jobId },
              data: {
                request: { ...request, websiteDomain: domain, websiteUrl: domain },
                updatedAt: new Date(),
              },
            });
          } catch (wipeErr) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[runBuildStoreJob] websiteUrl wipe failed (non-fatal):', wipeErr?.message || wipeErr);
            }
          }
        }
      }

      // Guard on request.goal only: intent may be personal_presence for other flows if a client
      // sends it alongside build_store — do not auto-publish/link from intent alone.
      const goalLower = String(request.goal || '').toLowerCase().trim();
      const isPersonalProfileJob =
        goalLower === 'build_personal_presence' || goalLower === 'create_personal_profile';
      const taskUserId = task.userId && String(task.userId).trim();
      const isRealUser = Boolean(taskUserId && !taskUserId.startsWith('guest_'));
      let publishedStoreId = null;
      let publishedSlug = null;
      if (isPersonalProfileJob && isRealUser) {
        try {
          const { publishDraft } = await import('./publishDraftService.js');
          const { getPersonalPresenceLinkFields } = await import('../personalPresence/personalPresenceQr.js');
          const pub = await publishDraft(prisma, {
            storeId: 'temp',
            draftId,
            userId: taskUserId,
            generationRunId,
          });
          publishedStoreId = pub?.storeId ?? null;
          publishedSlug = pub?.slug ?? null;
          if (publishedStoreId) {
            const linkFields = await getPersonalPresenceLinkFields(prisma, taskUserId, publishedStoreId);
            if (linkFields) {
              await prisma.user.update({ where: { id: taskUserId }, data: linkFields }).catch(() => {});
            }
          }
        } catch (pe) {
          console.warn('[runBuildStoreJob] personal profile auto-publish/link failed (non-fatal):', pe?.message || pe);
        }
      }

      if (typeof options.emitContextUpdate === 'function') {
        await options
          .emitContextUpdate({
            reasoning_line: { line: '✓ Build complete', timestamp: Date.now() },
          })
          .catch(() => {});
      }
      const resultPayload = {
        ok: true,
        generationRunId,
        draftId,
        ...(publishedStoreId ? { publishedStoreId, publishedSlug } : {}),
      };
      await transitionOrchestratorTaskStatus({
        prisma,
        taskId: jobId,
        toStatus: 'completed',
        fromStatus: 'running',
        actorType: 'worker',
        correlationId: generationRunId,
        reason: 'BUILD_STORE_JOB',
        result: resultPayload,
      }).catch(() => {});
      logMemoryUsage('build_store_job_end', {
        jobId,
        draftId,
        generationRunId,
        status: 'completed',
      });
    } catch (err) {
      console.warn('[runBuildStoreJob] unexpected error:', err?.message || err, { traceId, jobId, generationRunId });
      if (didTransitionToRunning) {
        if (options.stepReporter) {
          const cancelled = err?.code === 'MISSION_PIPELINE_CANCELLED';
          await options.stepReporter
            .failed(cancelled ? 'media' : 'catalog', err?.message ?? 'unexpected_error')
            .catch(() => {});
        }
        const failure =
          err?.code === 'MISSION_PIPELINE_CANCELLED'
            ? {
                errorMessage: 'Mission cancelled',
                errorCode: 'MISSION_CANCELLED',
                recommendedAction: 'retry',
              }
            : mapErrorToDraftFailure(err);
        const resultPayload = {
          ok: false,
          error: failure.errorMessage,
          generationRunId,
          code: failure.errorCode,
          errorCode: failure.errorCode,
          recommendedAction: failure.recommendedAction,
        };
        await transitionOrchestratorTaskStatus({
          prisma,
          taskId: jobId,
          toStatus: 'failed',
          fromStatus: 'running',
          actorType: 'worker',
          correlationId: generationRunId,
          reason: 'BUILD_STORE_JOB',
          result: resultPayload,
        }).catch(() => {});
      }
      logMemoryUsage('build_store_job_end', {
        jobId,
        draftId,
        generationRunId,
        status: 'failed',
      });
    }
  });
}

/**
 * Create orchestrator task + draft for build_store. Returns ids; caller should call runBuildStoreJob if needRun.
 * Params may include `requestExtras` (merged onto task.request) and `skipDraft` (task only, no DraftStore row).
 *
 * @param {object} [opts.guestDraft] When set with `guest: true` or `guestSessionId`, draft is created via `createDraft` (guest path).
 * @param {string} [opts.draftMode] Draft row `mode`; defaults to `'ai'` when omitted.
 * @param {object} [opts.draftInput] Deep-merged onto the in-file base draft `input` after it is built (never replaces base).
 * @param {string} [opts.existingJobId] When set with `skipDraft: false`, skip creating a new task; only create draft for this job/run (requires `generationRunId`).
 * @param {object} [opts.user] Passed to `createDraftStoreForUser` for tenant resolution (optional).
 */
export async function createBuildStoreJob(
  prisma,
  {
    tenantId,
    userId,
    businessName,
    businessType,
    storeType,
    rawInput,
    storeId = null,
    includeImages = true,
    generationRunId: clientRunId = null,
    location = null,
    currencyCode = null,
    intentMode = null,
    cardbeyTraceId = null,
    sourceType = null,
    websiteUrl = null,
    /** Merged onto `request` after base BuildStore fields (e.g. MI orchestra goal, templateKey, intent). */
    requestExtras = null,
    /** When true, only create the orchestrator task; caller creates the draft (e.g. MI orchestra rich baseInput). */
    skipDraft = false,
    guestDraft = null,
    draftMode = null,
    draftInput = null,
    existingJobId = null,
    user = null,
  },
) {
  const finalStoreId = storeId || 'temp';
  const runId = clientRunId && typeof clientRunId === 'string' && clientRunId.trim() ? clientRunId.trim() : null;
  let normalizedIntent = 'store';
  if (intentMode != null && String(intentMode).trim()) {
    const im = String(intentMode).trim().toLowerCase();
    if (im === 'website' || im === 'store') normalizedIntent = im;
  }
  const trace =
    cardbeyTraceId != null && String(cardbeyTraceId).trim() ? String(cardbeyTraceId).trim() : null;
  const locStr = location != null && String(location).trim() ? String(location).trim() : null;
  const currencyUpper =
    currencyCode != null && String(currencyCode).trim()
      ? String(currencyCode).trim().toUpperCase()
      : inferCurrencyFromLocationText(locStr || '') ||
        inferCurrencyFromLocationText(typeof businessName === 'string' ? businessName : '') ||
        'AUD';
  const requestPayload = {
    schemaVersion: 1,
    goal: 'build_store',
    rawInput: rawInput ?? null,
    rawUserText: rawInput ?? null,
    businessName: businessName ?? null,
    businessType: businessType ?? null,
    storeType: storeType ?? businessType ?? null,
    generationRunId: runId,
    storeId: finalStoreId,
    includeImages,
    itemId: null,
    intentMode: normalizedIntent,
    ...(locStr ? { location: locStr } : {}),
    currencyCode: currencyUpper,
    ...(sourceType != null && String(sourceType).trim() ? { sourceType: String(sourceType).trim() } : {}),
    ...(websiteUrl != null && String(websiteUrl).trim() ? { websiteUrl: String(websiteUrl).trim() } : {}),
    ...(trace ? { cardbeyTraceId: trace } : {}),
    ...(requestExtras && typeof requestExtras === 'object' && !Array.isArray(requestExtras) ? requestExtras : {}),
  };

  /** @type {{ id: string }} */
  let job;
  /** @type {string} */
  let resolvedRunId;

  const existingIdTrim =
    existingJobId != null && String(existingJobId).trim() ? String(existingJobId).trim() : null;
  if (existingIdTrim) {
    if (skipDraft) {
      throw new Error('createBuildStoreJob: existingJobId cannot be used with skipDraft: true');
    }
    if (!runId) {
      throw new Error('createBuildStoreJob: existingJobId requires generationRunId');
    }
    job = { id: existingIdTrim };
    resolvedRunId = runId;
  } else {
    job = await prisma.orchestratorTask.create({
      data: {
        tenantId,
        userId: userId || tenantId,
        insightId: null,
        entryPoint: 'build_store',
        status: 'queued',
        request: requestPayload,
      },
    });

    resolvedRunId = runId || job.id;
    if (!runId) {
      await prisma.orchestratorTask.update({
        where: { id: job.id },
        data: {
          request: { ...requestPayload, generationRunId: resolvedRunId },
          updatedAt: new Date(),
        },
      }).catch(() => {});
    }
  }

  if (skipDraft) {
    return {
      jobId: job.id,
      storeId: finalStoreId,
      tenantId,
      generationRunId: resolvedRunId,
      draftId: null,
      needRun: false,
      createdDraftId: null,
    };
  }

  const existingDraft = await getDraftByGenerationRunId(resolvedRunId).catch(() => null);
  const needDraft = !existingDraft;
  let createdDraftId = null;
  let responseDraftId = existingDraft ? existingDraft.id : null;

  if (needDraft) {
    const { createDraftStoreForUser, createDraft } = await import('./draftStoreService.js');
    const resolvedDraftMode = draftMode ?? 'ai';
    const useGuestDraft =
      guestDraft &&
      typeof guestDraft === 'object' &&
      !Array.isArray(guestDraft) &&
      (guestDraft.guest === true ||
        (guestDraft.guestSessionId != null && String(guestDraft.guestSessionId).trim()));

    const baseInput = {
      schemaVersion: 1,
      ...(!useGuestDraft ? { tenantId } : {}),
      storeId: finalStoreId,
      generationRunId: resolvedRunId,
      prompt: rawInput ?? null,
      businessName: businessName ?? null,
      businessType: businessType ?? storeType ?? null,
      storeType: storeType ?? businessType ?? null,
      includeImages,
      intentMode: normalizedIntent,
      rawUserText: rawInput ?? null,
      ...(locStr ? { location: locStr } : {}),
      currencyCode: currencyUpper,
      ...(sourceType != null && String(sourceType).trim() ? { sourceType: String(sourceType).trim() } : {}),
      ...(websiteUrl != null && String(websiteUrl).trim() ? { websiteUrl: String(websiteUrl).trim() } : {}),
      ...(trace ? { cardbeyTraceId: trace } : {}),
    };
    const input =
      draftInput && typeof draftInput === 'object' && !Array.isArray(draftInput)
        ? mergeDraftInputAfterBase(baseInput, draftInput)
        : baseInput;

    /** @type {{ id: string }} */
    let createdDraft;
    if (useGuestDraft) {
      const gs =
        guestDraft.guestSessionId != null && String(guestDraft.guestSessionId).trim()
          ? String(guestDraft.guestSessionId).trim()
          : undefined;
      createdDraft = await createDraft({
        mode: resolvedDraftMode,
        input,
        meta: {
          generationRunId: resolvedRunId,
          ownerUserId: null,
          ...(gs != null ? { guestSessionId: gs } : {}),
        },
      });
    } else {
      createdDraft = await createDraftStoreForUser(prisma, {
        ...(user != null ? { user } : {}),
        userId: userId || null,
        tenantKey: tenantId,
        input,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        mode: resolvedDraftMode,
        status: 'generating',
        generationRunId: resolvedRunId,
        committedStoreId: finalStoreId,
      });
    }
    createdDraftId = createdDraft.id;
    responseDraftId = createdDraft.id;
  }

  return {
    jobId: job.id,
    storeId: finalStoreId,
    tenantId,
    generationRunId: resolvedRunId,
    draftId: responseDraftId,
    needRun: !!createdDraftId,
    createdDraftId,
  };
}

export { newTraceId };

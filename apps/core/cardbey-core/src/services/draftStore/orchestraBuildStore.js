/**
 * Shared build_store job logic for orchestra/start and /api/business/create.
 * Exports createBuildStoreJob and runBuildStoreJob so both routes stay thin.
 */

import crypto from 'crypto';
import { generateDraft, getDraftByGenerationRunId } from './draftStoreService.js';
import { captureIngestSample, extractDomain } from '../contentIngest/captureSample.js';
import { mapErrorToDraftFailure } from '../errors/mapErrorToDraftFailure.js';
import { transitionOrchestratorTaskStatus } from '../../kernel/transitions/transitionService.js';

function newTraceId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * Run build_store job: generate draft and mark task completed/failed.
 * Idempotent and concurrency-safe; call from orchestra/start (auto-run) and job/:id/run.
 * Uses updateMany + count so "lost race" (count === 0) is exit-quietly, not 500/failed.
 * @param {object} [options] - optional { missionContext, emitContextUpdate, stepReporter, reactMissionId } for Foundation 2 / store pipeline
 */
export function runBuildStoreJob(prisma, jobId, draftId, generationRunId, traceId = newTraceId(), options = {}) {
  const log = (msg, data = {}) => {
    console.log(`[runBuildStoreJob] ${msg}`, { traceId, jobId, draftId, generationRunId, ...data });
  };
  log('invoked');

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

      await options.stepReporter?.started?.('catalog').catch(() => {});

      /** Prefer explicit pipeline id from caller (store POST /run) before task row is re-read with missionId. */
      const missionIdForReact = options.reactMissionId ?? task.missionId ?? jobId;

      const request = task.request && typeof task.request === 'object' ? task.request : {};
      // Optional ReAct step ordering only — not Performer Intake V2. Gated off unless USE_LLM_TASK_PLANNER=true.
      if (process.env.USE_LLM_TASK_PLANNER === 'true') {
        try {
          const { mergeMissionContext } = await import('../../lib/mission.js');
          const { planMission } = await import('../react/missionPlanner.ts');
          const { llmGateway } = await import('../../lib/llm/llmGateway.ts');
          const { BUILD_STORE_REACT_TOOLS } = await import('../react/buildStoreReactTools.ts');
          const intent = String(request.rawInput || request.goal || 'build_store').slice(0, 2000);
          const businessContext = {
            businessName: request.businessName ?? request.requestBusinessType ?? null,
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
    }
  });
}

/**
 * Create orchestrator task + draft for build_store. Returns ids; caller should call runBuildStoreJob if needRun.
 */
export async function createBuildStoreJob(prisma, {
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
}) {
  const finalStoreId = storeId || 'temp';
  const runId = clientRunId && typeof clientRunId === 'string' && clientRunId.trim() ? clientRunId.trim() : null;
  const requestPayload = {
    goal: 'build_store',
    rawInput: rawInput ?? null,
    businessName: businessName ?? null,
    businessType: businessType ?? null,
    generationRunId: runId,
    storeId: finalStoreId,
    includeImages,
    itemId: null,
    ...(location != null && String(location).trim() ? { location: String(location).trim() } : {}),
    ...(currencyCode != null && String(currencyCode).trim()
      ? { currencyCode: String(currencyCode).trim().toUpperCase() }
      : {}),
  };

  const job = await prisma.orchestratorTask.create({
    data: {
      tenantId,
      userId: userId || tenantId,
      insightId: null,
      entryPoint: 'build_store',
      status: 'queued',
      request: requestPayload,
    },
  });

  const resolvedRunId = runId || job.id;
  if (!runId) {
    await prisma.orchestratorTask.update({
      where: { id: job.id },
      data: {
        request: { ...requestPayload, generationRunId: resolvedRunId },
        updatedAt: new Date(),
      },
    }).catch(() => {});
  }

  const existingDraft = await getDraftByGenerationRunId(resolvedRunId).catch(() => null);
  const needDraft = !existingDraft;
  let createdDraftId = null;
  let responseDraftId = existingDraft ? existingDraft.id : null;

  if (needDraft) {
    const { createDraftStoreForUser } = await import('./draftStoreService.js');
    const input = {
      tenantId,
      storeId: finalStoreId,
      generationRunId: resolvedRunId,
      prompt: rawInput ?? null,
      businessName: businessName ?? null,
      businessType: businessType ?? storeType ?? null,
      storeType: storeType ?? businessType ?? null,
      includeImages,
      ...(location != null && String(location).trim() ? { location: String(location).trim() } : {}),
      ...(currencyCode != null && String(currencyCode).trim()
        ? { currencyCode: String(currencyCode).trim().toUpperCase() }
        : {}),
    };
    const createdDraft = await createDraftStoreForUser(prisma, {
      userId: userId || null,
      tenantKey: tenantId,
      input,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      mode: 'ai',
      status: 'generating',
      generationRunId: resolvedRunId,
      committedStoreId: finalStoreId,
    });
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

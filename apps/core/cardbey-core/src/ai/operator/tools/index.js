/**
 * AI Operator tool registry: wrap backend capabilities for runOperatorStep / runOperatorStepWithAgents.
 * No behavior change to existing APIs; tools call existing services.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { createBuildStoreJob, runBuildStoreJob } from '../../../services/draftStore/orchestraBuildStore.js';
import { getDraftByGenerationRunId, getDraft } from '../../../services/draftStore/draftStoreService.js';

// Operator tool names. These are registered in toolRegistry.js (category: operator) and covered by
// PROACTIVE_RUNWAY_TOOL_SET. Do not add names here without also adding them to toolRegistry.js.
const TOOL_NAMES = [
  'start_build_store',
  'get_draft_by_run',
  'get_draft_summary',
  'poll_orchestra_job',
  'publish_store',
  'log_event',
  'run_pipeline',
];

/**
 * start_build_store: create orchestrator job + draft and enqueue run.
 * @param {Object} params
 * @param {string} [params.businessName]
 * @param {string} [params.businessType]
 * @param {boolean} [params.includeImages]
 * @param {string} [params.generationRunId]
 * @param {string} [params.storeId]
 * @param {string} [params.currencyCode]
 * @param {string} params.tenantId
 * @param {string} [params.userId]
 * @returns {Promise<{ jobId: string, storeId?: string, draftId?: string, generationRunId: string }>}
 */
async function start_build_store(params) {
  const prisma = getPrismaClient();
  const tenantId = params?.tenantId ?? 'temp';
  const userId = params?.userId ?? tenantId;
  const result = await createBuildStoreJob(prisma, {
    tenantId,
    userId,
    businessName: params?.businessName ?? null,
    businessType: params?.businessType ?? null,
    storeType: params?.storeType ?? params?.businessType ?? undefined,
    rawInput: params?.rawInput ?? params?.rawUserText ?? null,
    location: params?.location ?? undefined,
    intentMode: ['website', 'store', 'personal_presence'].includes(params?.intentMode)
      ? params.intentMode
      : 'store',
    storeId: params?.storeId ?? 'temp',
    includeImages: params?.includeImages !== false,
    generationRunId: params?.generationRunId ?? null,
    currencyCode: params?.currencyCode ?? null,
  });
  if (result.needRun && result.jobId && result.draftId && result.generationRunId) {
    runBuildStoreJob(prisma, result.jobId, result.draftId, result.generationRunId, undefined, {
      originSurface: 'operator_tool',
    });
  }
  return {
    jobId: result.jobId,
    storeId: result.storeId,
    draftId: result.draftId ?? undefined,
    generationRunId: result.generationRunId,
  };
}

/**
 * get_draft_by_run: resolve draft by generationRunId.
 * @param {{ generationRunId: string }} params
 * @returns {Promise<{ draftId?: string, status?: string, storeId?: string } | null>}
 */
async function get_draft_by_run(params) {
  const generationRunId = params?.generationRunId;
  if (!generationRunId || typeof generationRunId !== 'string') return null;
  const draft = await getDraftByGenerationRunId(generationRunId.trim()).catch(() => null);
  if (!draft) return null;
  return {
    draftId: draft.id,
    status: draft.status ?? undefined,
    storeId: draft.committedStoreId ?? (draft.input && typeof draft.input === 'object' ? draft.input.storeId : undefined),
  };
}

/**
 * get_draft_summary: status and counts for a draft.
 * @param {{ draftId: string }} params
 * @returns {Promise<{ ok: boolean, status: string, productCount?: number, categoryCount?: number }>}
 */
async function get_draft_summary(params) {
  const draftId = params?.draftId;
  if (!draftId || typeof draftId !== 'string') {
    return { ok: false, status: 'unknown' };
  }
  const draft = await getDraft(draftId.trim()).catch(() => null);
  if (!draft) return { ok: false, status: 'not_found' };
  const preview = typeof draft.preview === 'object' ? draft.preview : (typeof draft.preview === 'string' ? (() => { try { return JSON.parse(draft.preview); } catch { return {}; } })() : {});
  const items = Array.isArray(preview?.items) ? preview.items : (Array.isArray(preview?.products) ? preview.products : []);
  const categories = Array.isArray(preview?.categories) ? preview.categories : [];
  return {
    ok: true,
    status: draft.status ?? 'unknown',
    productCount: items.length,
    categoryCount: categories.length,
  };
}

/**
 * poll_orchestra_job: get job status (normalized for operator).
 * @param {{ jobId: string }} params
 * @returns {Promise<{ status: string, storeId?: string, draftId?: string, success?: boolean, lastError?: string }>}
 */
async function poll_orchestra_job(params) {
  const jobId = params?.jobId;
  if (!jobId || typeof jobId !== 'string') {
    return { status: 'not_found' };
  }
  const prisma = getPrismaClient();
  const task = await prisma.orchestratorTask.findUnique({ where: { id: jobId.trim() } }).catch(() => null);
  if (!task) return { status: 'not_found' };
  const status = (task.status || '').toLowerCase();
  const request = task.request && typeof task.request === 'object' ? task.request : {};
  const result = task.result && typeof task.result === 'object' ? task.result : {};
  const draftId = result.draftId ?? request.draftId ?? null;
  const storeId = result.storeId ?? request.storeId ?? result.committedStoreId ?? null;
  const success = status === 'completed';
  const lastError = result.error ?? result.message ?? (status === 'failed' ? (result.errorCode || 'unknown') : undefined);
  return {
    status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status,
    storeId: storeId ?? undefined,
    draftId: draftId ?? undefined,
    success: status === 'completed',
    lastError,
  };
}

/**
 * publish_store: commit draft (simplified; full commit may require auth/terms).
 * @param {{ draftId: string }} params
 * @returns {Promise<{ ok: boolean, storeId?: string, error?: string }>}
 */
async function publish_store(params) {
  const draftId = params?.draftId;
  if (!draftId || typeof draftId !== 'string') {
    return { ok: false, error: 'draftId required' };
  }
  try {
    const { commitDraft } = await import('../../../services/draftStore/draftStoreService.js');
    const result = await commitDraft(draftId.trim(), {
      userId: params?.userId ?? null,
      acceptTerms: true,
      businessFields: params?.businessFields ?? {},
    });
    return {
      ok: true,
      storeId: result?.businessId ?? result?.storeId ?? undefined,
      error: result?.error,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message ?? 'commit_failed',
    };
  }
}

/**
 * log_event: append to mission run (no-op or persist to MissionRun.artifactSnapshot / lastError).
 * @param {{ missionRunId: string, level: string, message: string, data?: object }} params
 * @returns {Promise<void>}
 */
async function log_event(params) {
  if (process.env.NODE_ENV !== 'production' && params?.message) {
    console.log('[Operator log_event]', params.level, params.message, params.data ?? '');
  }
}

/**
 * run_pipeline: run the full store pipeline (start job, poll until done, get draft summary) as a single tool.
 * Used when the Operator chooses to run the deterministic pipeline instead of fine-grained steps.
 * @param {{ planId?: string, missionId?: string, missionRunId?: string }} params - missionRunId required (planId/missionId for API compatibility)
 * @returns {Promise<{ status: 'succeeded' | 'failed'; artifacts?: object; logsSummary?: object }>}
 */
async function run_pipeline(params) {
  const { loadOperatorState, saveOperatorState, loadOperatorStateByMissionId } = await import('../operatorState.js');
  let missionRunId = params?.missionRunId;
  if (!missionRunId && typeof params?.missionId === 'string') {
    const byMission = await loadOperatorStateByMissionId(params.missionId.trim());
    missionRunId = byMission?.id ?? null;
  }
  if (!missionRunId || typeof missionRunId !== 'string') {
    return { status: 'failed', logsSummary: { error: 'missionRunId or missionId required' } };
  }
  const state = await loadOperatorState(missionRunId.trim());
  if (!state) return { status: 'failed', logsSummary: { error: 'MissionRun not found' } };
  if (state.missionType !== 'build_store') {
    return { status: 'failed', logsSummary: { error: 'run_pipeline only supports build_store' } };
  }
  const MAX_POLL_ATTEMPTS = 60;
  const POLL_INTERVAL_MS = 3000;
  let currentState = state;
  try {
    if (!currentState.currentJobId) {
      const result = await start_build_store({
        tenantId: currentState.tenantId || 'temp',
        userId: currentState.userId || currentState.tenantId || 'temp',
        businessName: (currentState.goal || '').slice(0, 200) || undefined,
        includeImages: true,
      });
      await saveOperatorState(missionRunId, {
        currentStage: 'run_pipeline',
        currentJobId: result.jobId,
        currentGenerationRunId: result.generationRunId,
        currentDraftId: result.draftId ?? currentState.currentDraftId,
        currentStoreId: result.storeId,
        artifactSnapshot: {
          jobId: result.jobId,
          storeId: result.storeId,
          draftId: result.draftId,
          generationRunId: result.generationRunId,
        },
      });
      currentState = await loadOperatorState(missionRunId);
    }
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      const job = await poll_orchestra_job({ jobId: currentState.currentJobId });
      if (job.status === 'completed' || job.success) {
        const draftId = job.draftId ?? currentState.currentDraftId;
        let resolvedDraftId = draftId;
        if (!resolvedDraftId && currentState.currentGenerationRunId) {
          const byRun = await get_draft_by_run({ generationRunId: currentState.currentGenerationRunId });
          resolvedDraftId = byRun?.draftId ?? null;
        }
        await saveOperatorState(missionRunId, {
          currentStage: 'awaiting_review',
          currentDraftId: resolvedDraftId ?? currentState.currentDraftId,
          currentStoreId: job.storeId ?? currentState.currentStoreId,
          status: 'succeeded',
          artifactSnapshot: {
            ...(currentState.artifactSnapshot && typeof currentState.artifactSnapshot === 'object' ? currentState.artifactSnapshot : {}),
            draftId: resolvedDraftId,
            storeId: job.storeId,
          },
        });
        const summary = resolvedDraftId ? await get_draft_summary({ draftId: resolvedDraftId }) : null;
        return {
          status: 'succeeded',
          artifacts: { draftId: resolvedDraftId, storeId: job.storeId, jobId: currentState.currentJobId },
          logsSummary: summary ? { productCount: summary.productCount, categoryCount: summary.categoryCount, status: summary.status } : undefined,
        };
      }
      if (job.status === 'failed') {
        await saveOperatorState(missionRunId, {
          status: 'failed',
          lastError: { message: job.lastError ?? 'Job failed', code: 'JOB_FAILED' },
        });
        return { status: 'failed', logsSummary: { lastError: job.lastError } };
      }
      attempts++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      currentState = await loadOperatorState(missionRunId);
      if (currentState.status !== 'running') {
        return { status: 'failed', logsSummary: { error: 'Run no longer active' } };
      }
    }
    await saveOperatorState(missionRunId, {
      status: 'needs_human',
      lastError: { code: 'MAX_ATTEMPTS', message: 'run_pipeline polling timeout' },
    });
    return { status: 'failed', logsSummary: { error: 'Polling timeout' } };
  } catch (err) {
    await saveOperatorState(missionRunId, {
      status: 'failed',
      lastError: { message: err?.message ?? 'run_pipeline failed', code: 'TOOL_ERROR' },
    });
    return { status: 'failed', logsSummary: { error: err?.message } };
  }
}

/**
 * Run a tool by name. Params are passed through; tool names are whitelisted.
 * @param {string} toolName
 * @param {object} params
 * @returns {Promise<unknown>}
 */
export async function runTool(toolName, params) {
  const name = typeof toolName === 'string' ? toolName.trim() : '';
  if (!TOOL_NAMES.includes(name)) {
    throw new Error(`Unknown operator tool: ${name}. Allowed: ${TOOL_NAMES.join(', ')}`);
  }
  const fn = {
    start_build_store,
    get_draft_by_run,
    get_draft_summary,
    poll_orchestra_job,
    publish_store,
    log_event,
    run_pipeline,
  }[name];
  return fn(params);
}

export { TOOL_NAMES, start_build_store, get_draft_by_run, get_draft_summary, poll_orchestra_job, publish_store, log_event, run_pipeline };

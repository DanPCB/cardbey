/**
 * Single AI Operator step: load state, decide next action (rule-based for build_store), call one tool, update state.
 * Used by POST /api/ai-operator/missions/:missionId/start and polling/background loop.
 */

import { loadOperatorState, saveOperatorState } from './operatorState.js';
import { runTool } from './tools/index.js';

const MAX_ATTEMPTS_DEFAULT = 20;

/**
 * Run one operator step for the given MissionRun.
 * @param {string} missionRunId
 * @returns {Promise<import('./operatorState.js').OperatorState|null>}
 */
export async function runOperatorStep(missionRunId) {
  const state = await loadOperatorState(missionRunId);
  if (!state) return null;
  if (state.status !== 'running') return state;

  const { missionType, currentStage, currentJobId, currentDraftId, currentGenerationRunId, attempts, maxAttempts, tenantId, userId, goal, runPipelineAsSingleStep } = state;
  const effectiveMax = maxAttempts > 0 ? maxAttempts : MAX_ATTEMPTS_DEFAULT;

  if (missionType === 'build_store') {
    // --- run pipeline as single tool when requested (deterministic run via Operator) ---
    if (runPipelineAsSingleStep && (currentStage === 'planning' || !currentJobId)) {
      try {
        await runTool('run_pipeline', { missionRunId });
        return loadOperatorState(missionRunId);
      } catch (err) {
        await saveOperatorState(missionRunId, {
          status: 'failed',
          lastError: { message: err?.message ?? 'run_pipeline failed', code: 'TOOL_ERROR' },
        });
        return loadOperatorState(missionRunId);
      }
    }

    // --- planning / no job yet: start build store ---
    if (currentStage === 'planning' || !currentJobId) {
      try {
        const result = await runTool('start_build_store', {
          tenantId: tenantId || 'temp',
          userId: userId || tenantId || 'temp',
          businessName: (goal || '').slice(0, 200) || undefined,
          businessType: undefined,
          generationRunId: currentGenerationRunId || undefined,
          includeImages: true,
        });
        await saveOperatorState(missionRunId, {
          currentStage: 'running_job',
          currentJobId: result.jobId,
          currentGenerationRunId: result.generationRunId,
          currentDraftId: result.draftId ?? currentDraftId,
          currentStoreId: result.storeId,
          artifactSnapshot: {
            jobId: result.jobId,
            storeId: result.storeId,
            draftId: result.draftId,
            generationRunId: result.generationRunId,
          },
        });
        return loadOperatorState(missionRunId);
      } catch (err) {
        await saveOperatorState(missionRunId, {
          status: 'failed',
          lastError: { message: err?.message ?? 'start_build_store failed', code: 'TOOL_ERROR' },
        });
        return loadOperatorState(missionRunId);
      }
    }

    // --- running_job: poll job ---
    if (currentStage === 'running_job' && currentJobId) {
      try {
        const job = await runTool('poll_orchestra_job', { jobId: currentJobId });
        if (job.status === 'completed' || job.success) {
          const draftId = job.draftId ?? currentDraftId;
          let resolvedDraftId = draftId;
          if (!resolvedDraftId && currentGenerationRunId) {
            const byRun = await runTool('get_draft_by_run', { generationRunId: currentGenerationRunId });
            resolvedDraftId = byRun?.draftId ?? null;
          }
          await saveOperatorState(missionRunId, {
            currentStage: 'checking_draft',
            currentDraftId: resolvedDraftId ?? currentDraftId,
            currentStoreId: job.storeId ?? state.currentStoreId,
            artifactSnapshot: {
              ...(state.artifactSnapshot || {}),
              draftId: resolvedDraftId,
              storeId: job.storeId,
            },
          });
          return loadOperatorState(missionRunId);
        }
        if (job.status === 'failed') {
          await saveOperatorState(missionRunId, {
            status: 'failed',
            lastError: { message: job.lastError ?? 'Job failed', code: 'JOB_FAILED' },
          });
          return loadOperatorState(missionRunId);
        }
        // still running: increment attempts and possibly mark needs_human
        const nextAttempts = (state.attempts ?? 0) + 1;
        if (nextAttempts >= effectiveMax) {
          await saveOperatorState(missionRunId, {
            attempts: nextAttempts,
            status: 'needs_human',
            lastError: { code: 'MAX_ATTEMPTS', message: 'Max polling attempts reached' },
          });
        } else {
          await saveOperatorState(missionRunId, { attempts: nextAttempts });
        }
        return loadOperatorState(missionRunId);
      } catch (err) {
        await saveOperatorState(missionRunId, {
          status: 'failed',
          lastError: { message: err?.message ?? 'poll_orchestra_job failed', code: 'TOOL_ERROR' },
        });
        return loadOperatorState(missionRunId);
      }
    }

    // --- checking_draft: get summary and decide succeeded/failed ---
    if (currentStage === 'checking_draft' && (currentDraftId || state.currentDraftId)) {
      const draftId = currentDraftId || state.currentDraftId;
      try {
        const summary = await runTool('get_draft_summary', { draftId });
        if (summary?.status === 'ready') {
          await saveOperatorState(missionRunId, {
            currentStage: 'awaiting_review',
            status: 'succeeded',
            artifactSnapshot: { ...(state.artifactSnapshot || {}), draftId, status: 'ready' },
          });
          return loadOperatorState(missionRunId);
        }
        if (summary?.status === 'failed') {
          await saveOperatorState(missionRunId, {
            status: 'failed',
            lastError: { message: 'Draft generation failed', code: 'DRAFT_FAILED' },
          });
          return loadOperatorState(missionRunId);
        }
        const nextAttempts = (state.attempts ?? 0) + 1;
        if (nextAttempts >= effectiveMax) {
          await saveOperatorState(missionRunId, {
            attempts: nextAttempts,
            status: 'needs_human',
            lastError: { code: 'MAX_ATTEMPTS', message: 'Draft not ready within max attempts' },
          });
        } else {
          await saveOperatorState(missionRunId, { attempts: nextAttempts });
        }
        return loadOperatorState(missionRunId);
      } catch (err) {
        await saveOperatorState(missionRunId, {
          status: 'failed',
          lastError: { message: err?.message ?? 'get_draft_summary failed', code: 'TOOL_ERROR' },
        });
        return loadOperatorState(missionRunId);
      }
    }
  }

  const nextAttempts = (state.attempts ?? 0) + 1;
  if (nextAttempts >= effectiveMax) {
    await saveOperatorState(missionRunId, {
      attempts: nextAttempts,
      status: 'needs_human',
      lastError: { code: 'MAX_ATTEMPTS', message: 'Unhandled stage or mission type' },
    });
  } else {
    await saveOperatorState(missionRunId, { attempts: nextAttempts });
  }
  return loadOperatorState(missionRunId);
}

/**
 * OrchestratorTask → MissionPipeline mirror (Wave 3.2+).
 * MissionPipeline is the dashboard source of truth; OrchestratorTask stays internal.
 *
 * - Retries transient DB errors (3 attempts, backoff).
 * - Never throws to callers; logs and best-effort runState=error on hard failure.
 * - Uses auditedPipelineUpdate for successful writes (telemetry / optional PIPELINE_WRITE_AUDIT).
 *
 * OrchestratorTask.status → MissionPipeline (schema: MissionPipeline.status / runState)
 *   queued     → queued / idle
 *   running    → executing / running
 *   completed  → completed / done
 *   failed     → failed / error
 *   cancelled  → failed / error (forward-compatible)
 */

import { getPrismaClient } from './prisma.js';
import { auditedPipelineUpdate } from './orchestrator/pipelineWriteAudit.js';
import {
  buildStoreOrchestrationPipelineWrites,
  isPipelineOutputDualWriteEnabled,
} from './orchestrator/pipelineCanonicalResults.js';
import { emitHealthProbe } from './telemetry/healthProbes.js';
import { runPostMissionCompletionSummary } from './missionCompletion/postMissionSummary.js';
import { runCriticalSqliteWriteWithP1008Retry } from './sqliteCriticalWrite.js';
import { isPrismaSocketTimeoutError } from './orchestration/orchestrationStabilityMetrics.js';

const STATUS_MAP = {
  queued: { status: 'queued', runState: 'idle' },
  pending: { status: 'queued', runState: 'idle' },
  running: { status: 'executing', runState: 'running' },
  completed: { status: 'completed', runState: 'done' },
  failed: { status: 'failed', runState: 'error' },
  cancelled: { status: 'failed', runState: 'error' },
};

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

const PIPELINE_STEP_TERMINAL = new Set(['completed', 'skipped', 'failed']);

/** @param {number} attempt */
function orchestraMirrorRetryLog(attempt) {
  return `[orchestraMirror] critical update retry P1008 attempt=${attempt}`;
}

/**
 * Structured store missions (checkpoint → conditional → structured_store_build → analyze_store)
 * must not inherit OrchestratorTask.completed until every MissionPipelineStep is terminal.
 */
async function missionPipelineHasOutstandingSteps(prisma, missionId) {
  const steps = await prisma.missionPipelineStep.findMany({
    where: { missionId },
    select: { status: true, toolName: true },
  });
  if (steps.length === 0) return false;
  return steps.some((s) => !PIPELINE_STEP_TERMINAL.has(String(s?.status ?? '').toLowerCase()));
}

/**
 * Mirror an OrchestratorTask status into the linked MissionPipeline row.
 *
 * @param {string} missionId - MissionPipeline.id
 * @param {string} taskStatus - OrchestratorTask.status
 * @param {object} [extra] - outputsPatch?, errorMessage?, correlationId?, auditSource?, outputsFallback?
 */
export async function mirrorOrchestraStatusToPipeline(missionId, taskStatus, extra = {}) {
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  const key = (taskStatus || '').toLowerCase().trim();
  const mapped = STATUS_MAP[key];

  if (!id) {
    console.warn('[orchestraMirror] missing missionId — skipped');
    return;
  }
  if (!mapped) {
    console.warn(`[orchestraMirror] unknown taskStatus "${taskStatus}" for mission ${id} — skipped`);
    return;
  }

  const prisma = getPrismaClient();
  const auditSource = typeof extra.auditSource === 'string' && extra.auditSource.trim()
    ? extra.auditSource.trim()
    : 'orchestra_mirror';
  const correlationId = extra.correlationId != null ? extra.correlationId : null;

  try {
    const row = await prisma.missionPipeline.findUnique({
      where: { id },
      select: {
        type: true,
        outputsJson: true,
        metadataJson: true,
        progressTotalSteps: true,
        progressCompletedSteps: true,
        executionMode: true,
      },
    });

    if (!row) {
      console.warn(`[orchestraMirror] no MissionPipeline for id=${id} — mirror skipped`);
      return;
    }

    let outputsJson = row.outputsJson;
    let metadataJson = row.metadataJson;
    let metadataDirty = false;

    if (extra.outputsPatch && typeof extra.outputsPatch === 'object' && !Array.isArray(extra.outputsPatch)) {
      const built = buildStoreOrchestrationPipelineWrites({
        existingOutputsJson: outputsJson,
        existingMetadataJson: metadataJson,
        outputsPatch: extra.outputsPatch,
        dualWrite: isPipelineOutputDualWriteEnabled(),
      });
      outputsJson = built.outputsJson;
      if (built.metadataJson != null) {
        metadataJson = built.metadataJson;
        metadataDirty = true;
      }
    }

    if (extra.errorMessage) {
      metadataJson = {
        ...asObject(metadataJson),
        orchestraMirrorError: String(extra.errorMessage).slice(0, 4000),
      };
      metadataDirty = true;
    }

    let effectiveMapped = mapped;
    let pipelineStepsOutstanding = false;
    if (mapped.status === 'completed') {
      pipelineStepsOutstanding = await missionPipelineHasOutstandingSteps(prisma, id);
      if (pipelineStepsOutstanding) {
        const current = await prisma.missionPipeline.findUnique({
          where: { id },
          select: { status: true, runState: true },
        });
        const curStatus = String(current?.status ?? '').toLowerCase();
        effectiveMapped = {
          status: curStatus === 'awaiting_input' ? 'awaiting_input' : 'executing',
          runState: 'running',
        };
        console.log(
          '[orchestraMirror] OrchestratorTask completed but pipeline steps still outstanding — keeping mission executing',
          { missionId: id },
        );
      }
    }

    /** @type {Record<string, unknown>} */
    const data = {
      status: effectiveMapped.status,
      runState: effectiveMapped.runState,
      updatedAt: new Date(),
      outputsJson,
    };
    if (metadataDirty) {
      data.metadataJson = metadataJson;
    }

    // Legacy orchestra-only missions (no MissionPipelineStep rows): 0/1 → 1/1 on job complete.
    const executionMode = row.executionMode == null ? 'AUTO_RUN' : String(row.executionMode).trim() || 'AUTO_RUN';
    if (effectiveMapped.status === 'completed' && executionMode === 'AUTO_RUN' && !pipelineStepsOutstanding) {
      const stepCount = await prisma.missionPipelineStep.count({ where: { missionId: id } });
      if (stepCount === 0) {
        data.progressTotalSteps = 1;
        data.progressCompletedSteps = 1;
      }
    }

    if (effectiveMapped.status === 'completed') {
      data.completedAt = new Date();
    }
    if (effectiveMapped.status === 'failed') {
      data.failedAt = new Date();
    }

    console.log(`[orchestraMirror] critical update queued missionId=${id}`);
    await auditedPipelineUpdate(prisma, {
      where: { id },
      data,
      source: auditSource,
      correlationId,
      retryLog: orchestraMirrorRetryLog,
    });
    console.log(`[orchestraMirror] critical update success missionId=${id}`);

    if (effectiveMapped.status === 'completed' && !pipelineStepsOutstanding) {
      emitHealthProbe('orchestra_mirror', {
        missionId: id,
        taskStatus,
        pipelineStatus: 'completed',
      });
      const outputsForSummary =
        outputsJson && typeof outputsJson === 'object' && !Array.isArray(outputsJson) ? outputsJson : {};
      void runPostMissionCompletionSummary({
        missionId: id,
        missionType: row.type ?? null,
        metadataJson: row.metadataJson,
        outputsJson: outputsForSummary,
      }).catch(() => {});
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[orchestraMirror] mirrored id=${id} taskStatus=${key} → pipeline ${effectiveMapped.status}/${effectiveMapped.runState}`,
      );
    }
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err && typeof err === 'object' && 'code' in err ? String(/** @type {{ code?: string }} */ (err).code) : '';
    console.error(
      `[orchestraMirror] MIRROR FAILED for mission=${id}${code ? ` code=${code}` : ''}: ${msg}`,
    );

    try {
      const current = await prisma.missionPipeline.findUnique({
        where: { id },
        select: { status: true },
      });
      // Do not downgrade a completed pipeline to runState=error — that makes the console show "Needs attention".
      if (String(current?.status ?? '').toLowerCase() === 'completed') {
        return;
      }
      await runCriticalSqliteWriteWithP1008Retry(
        () =>
          prisma.missionPipeline.updateMany({
            where: { id },
            data: {
              runState: 'error',
              updatedAt: new Date(),
            },
          }),
        {
          label: 'orchestraMirror.error',
          logPrefix: '[orchestraMirror]',
          retryLog: orchestraMirrorRetryLog,
        },
      );
    } catch (secondary) {
      if (!isPrismaSocketTimeoutError(secondary) && process.env.NODE_ENV !== 'production') {
        console.warn('[orchestraMirror] secondary error mark failed:', secondary?.message || secondary);
      }
    }
  }
}

/**
 * Reconcile pipelines stuck in executing/queued while linked OrchestratorTask is terminal.
 * Run on startup and periodically.
 */
export async function reconcileStaleOrchestraMirrors() {
  const prisma = getPrismaClient();
  try {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const stalePipelines = await prisma.missionPipeline.findMany({
      where: {
        status: { in: ['executing', 'queued'] },
        updatedAt: { lt: staleBefore },
      },
      select: { id: true, status: true, runState: true, updatedAt: true },
    });

    if (stalePipelines.length === 0) return;

    console.log(`[orchestraMirror] reconciliation scan: ${stalePipelines.length} stale pipelines`);

    const terminal = new Set(['completed', 'failed', 'cancelled']);

    for (const pipeline of stalePipelines) {
      const task = await prisma.orchestratorTask.findFirst({
        where: { missionId: pipeline.id },
        select: { status: true, result: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (!task) continue;
      const st = (task.status || '').toLowerCase().trim();
      if (!terminal.has(st)) continue;

      console.log(
        `[orchestraMirror] reconciling stuck pipeline ${pipeline.id}: task=${st}, pipeline was ${pipeline.status}`,
      );

      const extra =
        task.result != null && typeof task.result === 'object'
          ? { outputsPatch: { result: task.result }, auditSource: 'orchestra_mirror_reconcile' }
          : { auditSource: 'orchestra_mirror_reconcile' };

      await mirrorOrchestraStatusToPipeline(pipeline.id, st, extra);
    }
  } catch (err) {
    console.error('[orchestraMirror] reconciliation scan failed:', err?.message || err);
  }
}

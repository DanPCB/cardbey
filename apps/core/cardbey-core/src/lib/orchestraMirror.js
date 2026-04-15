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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Mirror an OrchestratorTask status into the linked MissionPipeline row.
 *
 * @param {string} missionId - MissionPipeline.id
 * @param {string} taskStatus - OrchestratorTask.status
 * @param {object} [extra] - outputsPatch?, errorMessage?, correlationId?, auditSource?, outputsFallback?
 * @param {number} [attempt] - internal retry counter
 */
export async function mirrorOrchestraStatusToPipeline(missionId, taskStatus, extra = {}, attempt = 1) {
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

    /** @type {Record<string, unknown>} */
    const data = {
      status: mapped.status,
      runState: mapped.runState,
      updatedAt: new Date(),
      outputsJson,
    };
    if (metadataDirty) {
      data.metadataJson = metadataJson;
    }

    // AUTO_RUN pipelines should still show progress 0/1 → 1/1 when the job completes.
    const executionMode = row.executionMode == null ? 'AUTO_RUN' : String(row.executionMode).trim() || 'AUTO_RUN';
    if (mapped.status === 'completed' && executionMode === 'AUTO_RUN') {
      data.progressTotalSteps = 1;
      data.progressCompletedSteps = 1;
    }

    if (mapped.status === 'completed') {
      data.completedAt = new Date();
    }
    if (mapped.status === 'failed') {
      data.failedAt = new Date();
    }

    await auditedPipelineUpdate(prisma, {
      where: { id },
      data,
      source: auditSource,
      correlationId,
    });

    if (mapped.status === 'completed') {
      emitHealthProbe('orchestra_mirror', {
        missionId: id,
        taskStatus,
        pipelineStatus: 'completed',
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[orchestraMirror] mirrored id=${id} taskStatus=${key} → pipeline ${mapped.status}/${mapped.runState}`,
      );
    }
  } catch (err) {
    const msg = err?.message || String(err);
    if (attempt <= 3) {
      const delay = attempt * 200;
      console.warn(`[orchestraMirror] DB error attempt ${attempt}/3 for ${id}, retrying in ${delay}ms: ${msg}`);
      await sleep(delay);
      return mirrorOrchestraStatusToPipeline(missionId, taskStatus, extra, attempt + 1);
    }

    console.error(`[orchestraMirror] MIRROR FAILED after 3 attempts for mission=${id}: ${msg}`);
    try {
      await prisma.missionPipeline.updateMany({
        where: { id },
        data: {
          runState: 'error',
          updatedAt: new Date(),
        },
      });
    } catch {
      /* ignore secondary failure */
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

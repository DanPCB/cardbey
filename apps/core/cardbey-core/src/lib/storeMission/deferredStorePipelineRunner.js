/**
 * Durable deferred create-store pipeline runner.
 *
 * Intake returns store_mission_started before structured_store_build finishes.
 * Work is in-process (Render kills it on deploy/restart). Persist the run request
 * on MissionPipeline.metadataJson and resume orphans on boot.
 */

import { getPrismaClient } from '../prisma.js';
import { executeMission } from '../execution/missionExecutionEngine.js';
import { emitExecutionNotification, EXECUTION_EVENT_TYPES } from '../execution/executionNotificationEmitter.js';

const DEFERRED_META_KEY = 'deferredStorePipeline';
/** @type {Set<string>} */
const inFlight = new Set();

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {{
 *   body?: Record<string, unknown>;
 *   auditSource?: string;
 *   source?: string;
 *   userId?: string | null;
 * }} payload
 */
export async function persistDeferredStorePipelineRequest(prisma, missionId, payload = {}) {
  const id = pickString(missionId);
  if (!id) return;

  const row = await prisma.missionPipeline.findUnique({
    where: { id },
    select: { metadataJson: true },
  });
  const meta = asObject(row?.metadataJson);
  meta[DEFERRED_META_KEY] = {
    status: 'requested',
    requestedAt: new Date().toISOString(),
    body: asObject(payload.body),
    auditSource: pickString(payload.auditSource, 'intake_v2_unified'),
    source: pickString(payload.source, payload.auditSource, 'intake_v2_unified'),
    userId: pickString(payload.userId) || null,
  };

  await prisma.missionPipeline.update({
    where: { id },
    data: { metadataJson: meta },
  });
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {'running'|'completed'|'failed'} status
 * @param {Record<string, unknown>} [extra]
 */
async function patchDeferredMeta(prisma, missionId, status, extra = {}) {
  const id = pickString(missionId);
  if (!id) return;
  const row = await prisma.missionPipeline
    .findUnique({ where: { id }, select: { metadataJson: true } })
    .catch(() => null);
  if (!row) return;
  const meta = asObject(row.metadataJson);
  const prev = asObject(meta[DEFERRED_META_KEY]);
  meta[DEFERRED_META_KEY] = {
    ...prev,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
  };
  await prisma.missionPipeline
    .update({ where: { id }, data: { metadataJson: meta } })
    .catch(() => {});
}

/**
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {string} missionId
 * @param {{ code?: string; message?: string }} detail
 */
async function markMissionFailedFromDeferred(prisma, missionId, detail = {}) {
  const id = pickString(missionId);
  if (!id) return;

  const code = pickString(detail.code, 'DEFERRED_PIPELINE_FAILED');
  const message = pickString(detail.message, 'Store setup could not be started.');

  await prisma.missionPipeline
    .update({
      where: { id },
      data: {
        status: 'failed',
        runState: 'error',
        failedAt: new Date(),
      },
    })
    .catch((err) => {
      console.warn('[DeferredStorePipeline] mark failed write:', err?.message ?? err);
    });

  await patchDeferredMeta(prisma, id, 'failed', {
    errorCode: code,
    errorMessage: message.slice(0, 500),
  });

  void emitExecutionNotification(
    EXECUTION_EVENT_TYPES.FAILED,
    { tool: 'create_store', code, message, deferred: true },
    { missionId: id, source: 'deferred_store_pipeline', executionPath: 'kernel_dispatch' },
  ).catch(() => {});
}

/**
 * @param {{
 *   prisma?: import('../prisma.js').PrismaClient;
 *   user?: object;
 *   missionId: string;
 *   body?: Record<string, unknown>;
 *   auditSource?: string;
 *   source?: string;
 * }} opts
 */
export async function runDeferredStorePipelineOnce(opts = {}) {
  const prisma = opts.prisma ?? getPrismaClient();
  const missionId = pickString(opts.missionId);
  if (!missionId) return { ok: false, error: 'MISSION_REQUIRED' };
  if (inFlight.has(missionId)) {
    return { ok: true, skipped: true, reason: 'already_in_flight' };
  }

  inFlight.add(missionId);
  const auditSource = pickString(opts.auditSource, opts.source, 'intake_v2_unified');
  const source = pickString(opts.source, auditSource);
  const body = asObject(opts.body);
  const user =
    opts.user && typeof opts.user === 'object'
      ? opts.user
      : { id: pickString(opts.user?.id) || 'temp' };

  try {
    await patchDeferredMeta(prisma, missionId, 'running', { startedAt: new Date().toISOString() });

    const result = await executeMission({
      mode: 'checkpoint_pipeline',
      prisma,
      user,
      missionId,
      body,
      auditSource,
      source,
    });

    if (!result?.ok) {
      console.error('[DeferredStorePipeline] executeMission soft-failed', {
        missionId,
        error: result?.error ?? null,
        message: result?.message ?? null,
        statusCode: result?.statusCode ?? null,
      });
      await markMissionFailedFromDeferred(prisma, missionId, {
        code: typeof result?.error === 'string' ? result.error : 'pipeline_run_failed',
        message:
          typeof result?.message === 'string' && result.message.trim()
            ? result.message.trim()
            : 'Store setup could not be started.',
      });
      return { ok: false, result };
    }

    await patchDeferredMeta(prisma, missionId, 'completed', {
      completedAt: new Date().toISOString(),
      draftId: pickString(result?.draftId) || null,
    });
    return { ok: true, result };
  } catch (err) {
    console.error('[DeferredStorePipeline] executeMission threw', {
      missionId,
      message: err?.message ?? String(err),
    });
    await markMissionFailedFromDeferred(prisma, missionId, {
      code: 'pipeline_run_threw',
      message:
        typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : 'Store setup could not be started.',
    });
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    inFlight.delete(missionId);
  }
}

/**
 * Fire-and-forget after persisting the run request (intake HTTP returns immediately).
 * @param {{
 *   prisma: import('../prisma.js').PrismaClient;
 *   user: object;
 *   missionId: string;
 *   body?: Record<string, unknown>;
 *   auditSource?: string;
 *   source?: string;
 * }} opts
 */
export async function scheduleDeferredStorePipelineRun(opts) {
  const prisma = opts.prisma ?? getPrismaClient();
  const missionId = pickString(opts.missionId);
  if (!missionId) return;

  await persistDeferredStorePipelineRequest(prisma, missionId, {
    body: opts.body,
    auditSource: opts.auditSource,
    source: opts.source,
    userId: pickString(opts.user?.id, opts.user?.userId),
  });

  void runDeferredStorePipelineOnce(opts).catch((err) => {
    console.error(
      '[DeferredStorePipeline] unhandled schedule error',
      missionId,
      err?.message ?? err,
    );
  });
}

/**
 * True when structured store draft step never produced a draft and work can be resumed.
 * @param {object} pipeline
 */
function isOrphanDeferredCandidate(pipeline) {
  const status = String(pipeline?.status ?? '').toLowerCase();
  if (
    !['awaiting_confirmation', 'queued', 'requested', 'planned', 'executing', 'failed'].includes(
      status,
    )
  ) {
    return false;
  }
  const outputs = asObject(pipeline?.outputsJson);
  if (pickString(outputs.draftId)) return false;

  const steps = Array.isArray(pipeline?.steps) ? pipeline.steps : [];
  const buildStep = steps.find(
    (s) => String(s?.toolName ?? '').toLowerCase() === 'structured_store_build',
  );
  if (!buildStep) return false;
  const stepStatus = String(buildStep.status ?? '').toLowerCase();
  return stepStatus === 'pending' || stepStatus === 'running' || stepStatus === 'failed';
}

/**
 * Resume store missions whose deferred draft build never finished (e.g. Render restart).
 * @param {import('../prisma.js').PrismaClient} [prismaIn]
 * @param {{ maxAgeMs?: number; limit?: number }} [opts]
 */
export async function resumeOrphanedDeferredStorePipelines(prismaIn, opts = {}) {
  if (process.env.NODE_ENV === 'test') return { resumed: 0, scanned: 0 };

  const prisma = prismaIn ?? getPrismaClient();
  const maxAgeMs =
    typeof opts.maxAgeMs === 'number' && opts.maxAgeMs > 0 ? opts.maxAgeMs : 30 * 1000;
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 20;
  const staleBefore = new Date(Date.now() - maxAgeMs);

  const candidates = await prisma.missionPipeline.findMany({
    where: {
      type: 'store',
      status: {
        in: ['awaiting_confirmation', 'queued', 'requested', 'planned', 'executing', 'failed'],
      },
      updatedAt: { lt: staleBefore },
    },
    select: {
      id: true,
      status: true,
      createdBy: true,
      tenantId: true,
      metadataJson: true,
      outputsJson: true,
      updatedAt: true,
      steps: {
        where: { toolName: 'structured_store_build' },
        select: { id: true, toolName: true, status: true },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  let resumed = 0;
  for (const pipeline of candidates) {
    if (!isOrphanDeferredCandidate(pipeline)) continue;
    if (inFlight.has(pipeline.id)) continue;

    const meta = asObject(pipeline.metadataJson);
    const deferred = asObject(meta[DEFERRED_META_KEY]);
    const deferredStatus = String(deferred.status ?? '').toLowerCase();
    if (deferredStatus === 'completed') continue;
    if (deferredStatus === 'running') {
      const stepStatus = String(pipeline.steps?.[0]?.status ?? '').toLowerCase();
      if (stepStatus !== 'pending' && stepStatus !== 'failed') continue;
    }

    const body = asObject(deferred.body);
    const auditSource = pickString(deferred.auditSource, meta.source, 'intake_v2_unified');
    const source = pickString(deferred.source, auditSource);
    const userId = pickString(deferred.userId, pipeline.createdBy);
    if (!userId) {
      console.warn('[DeferredStorePipeline] orphan skip — no userId', pipeline.id);
      continue;
    }

    const missionMeta = meta;
    const resumeBody =
      Object.keys(body).length > 0
        ? body
        : {
            businessName: pickString(missionMeta.businessName),
            businessType: pickString(missionMeta.businessType, 'Other'),
            location: pickString(missionMeta.location),
            intentMode: pickString(missionMeta.intentMode, 'store'),
          };

    if (!pickString(resumeBody.businessName)) {
      console.warn('[DeferredStorePipeline] orphan skip — no businessName', pipeline.id);
      continue;
    }

    // Failed / interrupted deferred runs must re-enter a runnable pipeline status.
    const pipelineStatus = String(pipeline.status ?? '').toLowerCase();
    if (pipelineStatus === 'failed' || pipelineStatus === 'executing') {
      const buildStep = pipeline.steps?.[0];
      if (buildStep?.id) {
        await prisma.missionPipelineStep
          .update({
            where: { id: buildStep.id },
            data: { status: 'pending', errorJson: null, completedAt: null, startedAt: null },
          })
          .catch(() => {});
      }
      await prisma.missionPipeline
        .update({
          where: { id: pipeline.id },
          data: {
            status: 'awaiting_confirmation',
            runState: 'idle',
            failedAt: null,
          },
        })
        .catch(() => {});
    }

    console.log('[DeferredStorePipeline] resuming orphan pipeline', {
      missionId: pipeline.id,
      status: pipeline.status,
      deferredStatus: deferredStatus || 'missing',
    });

    void runDeferredStorePipelineOnce({
      prisma,
      user: { id: userId, tenantId: pipeline.tenantId ?? userId },
      missionId: pipeline.id,
      body: resumeBody,
      auditSource,
      source,
    }).catch((err) => {
      console.error('[DeferredStorePipeline] resume error', pipeline.id, err?.message ?? err);
    });
    resumed += 1;
  }

  if (resumed > 0 || candidates.length > 0) {
    console.log('[DeferredStorePipeline] orphan scan', {
      scanned: candidates.length,
      resumed,
    });
  }

  return { resumed, scanned: candidates.length };
}

/** @internal test helper */
export function resetDeferredStorePipelineInFlightForTests() {
  inFlight.clear();
}

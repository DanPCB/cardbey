/**
 * Kernel transition service - doctrine boundary for status writes.
 * All status transitions go through here; each success writes an AuditEvent.
 * WorkflowRun (store_creation) is synced on DraftStore transitions; failures are logged only.
 * Callers pass prisma to avoid circular imports.
 */

import { isDraftStoreTransitionAllowed, isOrchestratorTaskTransitionAllowed } from './transitionRules.js';
import { mirrorOrchestraStatusToPipeline } from '../../lib/orchestraMirror.js';

const WORKFLOW_KEY_STORE_CREATION = 'store_creation';
const TERMINAL_SUCCESS_STATUSES = new Set(['ready', 'committed']);

/**
 * Sync WorkflowRun when DraftStore status transitions (store_creation workflow).
 * - To "generating": create one running run if none exists (idempotent).
 * - To "ready" | "committed": end current running run as completed.
 * - To "failed": end current running run as failed with failureCode.
 * Does not throw; logs on error so transition result is unchanged.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} draftId
 * @param {string} toStatus - normalized lower status
 * @param {object} [extraData] - may contain errorCode for failed
 * @param {string} [reason]
 */
async function syncWorkflowRunOnDraftStatus(prisma, draftId, toStatus, extraData = {}, reason = null) {
  if (!prisma || !prisma.workflowRun || typeof prisma.workflowRun.findFirst !== 'function') {
    console.warn('[WorkflowRun] prisma.workflowRun missing', {
      hasPrisma: !!prisma,
      hasWorkflowRun: !!prisma?.workflowRun,
      typeOfFindFirst: typeof prisma?.workflowRun?.findFirst,
      draftId,
      toStatus,
    });
    return;
  }
  try {
    const now = new Date();
    const draftStoreId = draftId;

    if (toStatus === 'generating') {
      const existing = await prisma.workflowRun.findFirst({
        where: {
          draftStoreId,
          workflowKey: WORKFLOW_KEY_STORE_CREATION,
          status: 'running',
        },
        select: { id: true },
      });
      if (existing) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[WorkflowRun] idempotent skip: run already exists', {
            draftId,
            workflowKey: WORKFLOW_KEY_STORE_CREATION,
            runId: existing.id,
          });
        }
        return;
      }
      const run = await prisma.workflowRun.create({
        data: {
          workflowKey: WORKFLOW_KEY_STORE_CREATION,
          draftStoreId,
          status: 'running',
          startedAt: now,
        },
      });
      console.log('[WorkflowRun] run_started', {
        draftId,
        workflowKey: WORKFLOW_KEY_STORE_CREATION,
        runId: run.id,
      });
      return;
    }

    if (TERMINAL_SUCCESS_STATUSES.has(toStatus)) {
      const run = await prisma.workflowRun.findFirst({
        where: {
          draftStoreId,
          workflowKey: WORKFLOW_KEY_STORE_CREATION,
          status: 'running',
        },
        select: { id: true },
      });
      if (run) {
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: 'completed', endedAt: now, updatedAt: now },
        });
        console.log('[WorkflowRun] run_completed', {
          draftId,
          workflowKey: WORKFLOW_KEY_STORE_CREATION,
          runId: run.id,
          toStatus,
        });
      }
      return;
    }

    if (toStatus === 'failed') {
      const run = await prisma.workflowRun.findFirst({
        where: {
          draftStoreId,
          workflowKey: WORKFLOW_KEY_STORE_CREATION,
          status: 'running',
        },
        select: { id: true },
      });
      if (run) {
        const failureCode =
          (extraData && typeof extraData.errorCode === 'string' && extraData.errorCode.trim()) ||
          (typeof reason === 'string' && reason.trim()) ||
          null;
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            endedAt: now,
            failureCode: failureCode || undefined,
            updatedAt: now,
          },
        });
        console.log('[WorkflowRun] run_failed', {
          draftId,
          workflowKey: WORKFLOW_KEY_STORE_CREATION,
          runId: run.id,
          failureCode: failureCode || undefined,
        });
      }
    }
  } catch (err) {
    console.warn('[WorkflowRun] sync failed (transition unchanged):', err?.message || err, { draftId, toStatus });
  }
}

/**
 * @typedef {Object} TransitionDraftStoreParams
 * @property {import('@prisma/client').PrismaClient} prisma - client for draftStore/auditEvent (may be tx)
 * @property {import('@prisma/client').PrismaClient} [syncPrisma] - when prisma is a transaction client (e.g. inside $transaction), pass the root PrismaClient here so WorkflowRun sync runs with a client that has workflowRun; otherwise sync may no-op (guard in syncWorkflowRunOnDraftStatus)
 * @property {string} draftId
 * @property {string} toStatus
 * @property {string} [fromStatus] - optional expected current status for validation
 * @property {'human'|'automation'|'worker'|'system'} actorType
 * @property {string} [actorId]
 * @property {string} [correlationId]
 * @property {string} [reason]
 * @property {object} [metadata]
 * @property {object} [extraData] - merged into prisma.draftStore.update data (error, errorCode, etc.)
 */

/**
 * Transition DraftStore status. Validates allowed transitions, updates DB, writes AuditEvent.
 * @param {TransitionDraftStoreParams} params
 * @returns {Promise<{ok: boolean, beforeStatus?: string, afterStatus?: string, auditEventId?: string, code?: string, message?: string}>}
 */
export async function transitionDraftStoreStatus({
  prisma,
  syncPrisma = null,
  draftId,
  toStatus,
  fromStatus: expectedFrom,
  actorType,
  actorId = null,
  correlationId = null,
  reason = null,
  metadata = null,
  extraData = {},
}) {
  const to = (toStatus || '').toLowerCase().trim();
  let before = expectedFrom;

  try {
    if (expectedFrom == null) {
      const draft = await prisma.draftStore.findUnique({
        where: { id: draftId },
        select: { status: true },
      });
      if (!draft) {
        return { ok: false, code: 'DRAFT_NOT_FOUND', message: `Draft ${draftId} not found` };
      }
      before = (draft.status || '').toLowerCase().trim();
    } else {
      before = (expectedFrom || '').toLowerCase().trim();
    }

    if (!isDraftStoreTransitionAllowed(before, to)) {
      return {
        ok: false,
        code: 'TRANSITION_NOT_ALLOWED',
        message: `DraftStore ${before}->${to} not allowed`,
      };
    }

    const updateData = {
      status: to,
      updatedAt: new Date(),
      ...extraData,
    };

    await prisma.draftStore.update({
      where: { id: draftId },
      data: updateData,
    });

    const audit = await prisma.auditEvent.create({
      data: {
        entityType: 'DraftStore',
        entityId: draftId,
        action: 'status_transition',
        fromStatus: before || null,
        toStatus: to,
        actorType,
        actorId: actorId || null,
        correlationId: correlationId || null,
        reason: reason || null,
        metadata: metadata || undefined,
      },
    });

    const clientForSync =
      syncPrisma && typeof syncPrisma.workflowRun?.findFirst === 'function' ? syncPrisma : prisma;
    if (syncPrisma && clientForSync === syncPrisma && process.env.NODE_ENV !== 'production') {
      console.log('[WorkflowRun] using syncPrisma for WorkflowRun sync (prisma was tx or missing workflowRun)', {
        draftId,
        toStatus: to,
      });
    }
    await syncWorkflowRunOnDraftStatus(clientForSync, draftId, to, extraData || {}, reason);

    return {
      ok: true,
      beforeStatus: before,
      afterStatus: to,
      auditEventId: audit.id,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'TRANSITION_FAILED',
      message: err?.message || String(err),
    };
  }
}

/**
 * @typedef {Object} TransitionOrchestratorTaskParams
 * @property {import('@prisma/client').PrismaClient} prisma
 * @property {string} taskId
 * @property {string} toStatus
 * @property {string} [fromStatus] - expected current status
 * @property {'human'|'automation'|'worker'|'system'} actorType
 * @property {string} [actorId]
 * @property {string} [correlationId]
 * @property {string} [reason]
 * @property {object} [metadata]
 * @property {object} [result] - task result JSON (for completed/failed)
 */

/**
 * Transition OrchestratorTask status.
 * For queued->running: uses updateMany for atomicity; if count===0 returns {ok:false} without throwing.
 * @param {TransitionOrchestratorTaskParams} params
 * @returns {Promise<{ok: boolean, beforeStatus?: string, afterStatus?: string, auditEventId?: string, code?: string, message?: string}>}
 */
export async function transitionOrchestratorTaskStatus({
  prisma,
  taskId,
  toStatus,
  fromStatus: expectedFrom,
  actorType,
  actorId = null,
  correlationId = null,
  reason = null,
  metadata = null,
  result = null,
}) {
  const to = (toStatus || '').toLowerCase().trim();

  try {
    // Special case: queued->running must be atomic (updateMany)
    if (expectedFrom === 'queued' && to === 'running') {
      const { count } = await prisma.orchestratorTask.updateMany({
        where: { id: taskId, status: 'queued' },
        data: { status: 'running', updatedAt: new Date() },
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log('[OrchestratorTask:update]', { taskId, fromStatus: 'queued', toStatus: 'running' });
      }
      if (count === 0) {
        return {
          ok: false,
          code: 'NOT_IN_EXPECTED_STATE',
          message: 'Task not in queued or already running',
        };
      }
      const audit = await prisma.auditEvent.create({
        data: {
          entityType: 'OrchestratorTask',
          entityId: taskId,
          action: 'status_transition',
          fromStatus: 'queued',
          toStatus: 'running',
          actorType,
          actorId: actorId || null,
          correlationId: correlationId || null,
          reason: reason || null,
          metadata: metadata || undefined,
        },
      });
      const linkedRun = await prisma.orchestratorTask.findUnique({
        where: { id: taskId },
        select: { missionId: true },
      });
      if (linkedRun?.missionId) {
        await mirrorOrchestraStatusToPipeline(linkedRun.missionId, 'running', {
          correlationId,
          auditSource: 'orchestra_task_transition',
        });
      }
      return {
        ok: true,
        beforeStatus: 'queued',
        afterStatus: 'running',
        auditEventId: audit.id,
      };
    }

    // All other transitions: read current, validate, update
    const task = await prisma.orchestratorTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    if (!task) {
      return { ok: false, code: 'TASK_NOT_FOUND', message: `Task ${taskId} not found` };
    }
    const before = (task.status || '').toLowerCase().trim();

    if (expectedFrom != null && before !== (expectedFrom || '').toLowerCase().trim()) {
      return {
        ok: false,
        code: 'NOT_IN_EXPECTED_STATE',
        message: `Expected status ${expectedFrom}, got ${before}`,
      };
    }

    if (!isOrchestratorTaskTransitionAllowed(before, to)) {
      return {
        ok: false,
        code: 'TRANSITION_NOT_ALLOWED',
        message: `OrchestratorTask ${before}->${to} not allowed`,
      };
    }

    const updateData = {
      status: to,
      updatedAt: new Date(),
      ...(result != null ? { result } : {}),
    };

    await prisma.orchestratorTask.update({
      where: { id: taskId },
      data: updateData,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('[OrchestratorTask:update]', { taskId, fromStatus: before, toStatus: to });
    }

    const audit = await prisma.auditEvent.create({
      data: {
        entityType: 'OrchestratorTask',
        entityId: taskId,
        action: 'status_transition',
        fromStatus: before || null,
        toStatus: to,
        actorType,
        actorId: actorId || null,
        correlationId: correlationId || null,
        reason: reason || null,
        metadata: metadata || undefined,
      },
    });

    const linked = await prisma.orchestratorTask.findUnique({
      where: { id: taskId },
      select: { missionId: true, result: true },
    });
    if (linked?.missionId) {
      /** @type {{ correlationId?: string|null, auditSource: string, outputsPatch?: Record<string, unknown>, errorMessage?: string }} */
      const mirrorExtra = {
        correlationId,
        auditSource: 'orchestra_task_transition',
      };
      const resultForMirror = result != null ? result : linked.result;
      if ((to === 'completed' || to === 'failed') && resultForMirror != null) {
        mirrorExtra.outputsPatch = { result: resultForMirror };
      }
      if (to === 'failed' && typeof reason === 'string' && reason.trim()) {
        mirrorExtra.errorMessage = reason.trim();
      }
      await mirrorOrchestraStatusToPipeline(linked.missionId, to, mirrorExtra);
    }

    return {
      ok: true,
      beforeStatus: before,
      afterStatus: to,
      auditEventId: audit.id,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'TRANSITION_FAILED',
      message: err?.message || String(err),
    };
  }
}

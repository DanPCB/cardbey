/**
 * M3 Checkpoints — step progress reporter.
 * Creates a stepReporter for a mission + job that emits MissionEvents and updates
 * Mission.context.missionPlan[jobId].steps[n].status in real time.
 *
 * Safe to call when missionId or jobId is missing — all methods become no-ops.
 * All DB operations are caught and ignored — build flow is never blocked.
 *
 * @param {string} missionId
 * @param {string} jobId
 * @param {object} options
 * @param {object} options.prisma - Prisma client (same instance as route)
 * @param {Function} options.mergeMissionPlanStep - from lib/mission.js
 */
export function createStepReporter(missionId, jobId, options = {}) {
  const { prisma, mergeMissionPlanStep } = options;

  // Return no-op reporter if dependencies missing
  if (!missionId || !jobId || !prisma || !mergeMissionPlanStep) {
    return {
      started: () => Promise.resolve(),
      completed: () => Promise.resolve(),
      failed: () => Promise.resolve(),
    };
  }

  async function emitStepEvent(stepId, type, extra = {}) {
    try {
      await prisma.missionEvent.create({
        data: {
          missionId,
          type,
          agent: 'orchestra',
          payload: {
            jobId,
            stepId,
            ...extra,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (e) {
      console.warn(`[stepReporter] emitStepEvent ${type} failed (non-fatal):`, e?.message);
    }
  }

  return {
    /**
     * Mark step as running and emit step_started event.
     * @param {string} stepId
     */
    async started(stepId) {
      if (!stepId) return;
      await mergeMissionPlanStep(missionId, jobId, stepId, { status: 'running' }, { prisma })
        .catch(() => {});
      await emitStepEvent(stepId, 'step_started');
    },

    /**
     * Mark step as completed and emit step_completed (+ step_checkpoint if step is a checkpoint).
     * @param {string} stepId
     * @param {{ checkpoint?: boolean }} [opts]
     */
    async completed(stepId, opts = {}) {
      if (!stepId) return;
      await mergeMissionPlanStep(missionId, jobId, stepId, { status: 'completed' }, { prisma })
        .catch(() => {});
      await emitStepEvent(stepId, 'step_completed');
      if (opts.checkpoint) {
        await emitStepEvent(stepId, 'step_checkpoint', { checkpoint: true });
      }
    },

    /**
     * Mark step as failed and emit step_failed event.
     * @param {string} stepId
     * @param {string} [reason]
     */
    async failed(stepId, reason) {
      if (!stepId) return;
      await mergeMissionPlanStep(missionId, jobId, stepId, { status: 'failed' }, { prisma })
        .catch(() => {});
      await emitStepEvent(stepId, 'step_failed', reason ? { reason } : {});
    },
  };
}

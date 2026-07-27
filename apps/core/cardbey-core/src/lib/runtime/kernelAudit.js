/**
 * In-process audit trail for Runtime Kernel executions.
 * Persists to SkillDispatchLog when available (best-effort).
 */

/** @type {Array<object>} */
const auditRing = [];
const MAX_AUDIT = 500;

/**
 * @param {object} execution
 * @param {string} [execution.intentId]
 * @param {string} [execution.missionId]
 * @param {string} [execution.capability]
 * @param {string} [execution.toolName]
 * @param {string} [execution.source]
 * @param {number} [execution.durationMs]
 * @param {boolean} [execution.success]
 * @param {string} [execution.observationId]
 */
export async function recordKernelExecution(execution) {
  const row = {
    intentId: execution.intentId ?? null,
    missionId: execution.missionId ?? null,
    capability: execution.capability ?? execution.toolName ?? null,
    toolName: execution.toolName ?? null,
    source: execution.source ?? 'runtime_kernel',
    durationMs: execution.durationMs ?? null,
    success: execution.success !== false,
    observationId: execution.observationId ?? null,
    timestamp: new Date().toISOString(),
  };
  auditRing.push(row);
  if (auditRing.length > MAX_AUDIT) auditRing.shift();

  try {
    const { getPrismaClient } = await import('../prisma.js');
    const prisma = getPrismaClient();
    if (prisma?.skillDispatchLog?.create) {
      await prisma.skillDispatchLog.create({
        data: {
          traceId: row.missionId ?? `kernel-${Date.now()}`,
          userId: execution.userId ?? null,
          query: String(row.toolName ?? row.capability ?? 'kernel_step'),
          intent: 'kernel_execution',
          matchedSkill: row.toolName ?? null,
          confidence: row.success ? 1 : 0,
          executionPath: 'runtime_kernel',
          outcome: row.success ? 'success' : 'failed',
          latencyMs: row.durationMs ?? null,
        },
      }).catch(() => {});
    }
  } catch {
    /* non-fatal */
  }

  return row;
}

/** Test / diagnostics helper */
export function getKernelAuditEntriesForTests() {
  return [...auditRing];
}

export function resetKernelAuditForTests() {
  auditRing.length = 0;
}

export class KernelAudit {
  async record(execution) {
    return recordKernelExecution(execution);
  }
}

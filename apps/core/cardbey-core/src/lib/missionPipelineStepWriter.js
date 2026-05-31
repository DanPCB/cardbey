/**
 * Phase 2.3-B — Critical Pipeline Write Hardening, Step 4: idempotent insert-missing step creation.
 *
 * Replaces blind `MissionPipelineStep.createMany` with a duplicate-safe insert that relies on the
 * `@@unique([missionId, orderIndex])` constraint as the final guard.
 *
 * HARD CONSTRAINTS (unchanged by this helper):
 * - Does NOT change Mission FSM semantics, the transition table, step order, Performer Runtime
 *   authority, or dispatchTool. It only changes HOW rows are written, never which rows or their order.
 * - Behavior is gated behind PERFORMER_PIPELINE_WRITE_HARDENING:
 *     flag OFF → byte-for-byte the original `createMany({ data })` behavior.
 *     flag ON  → read existing orderIndexes for the mission, insert only the missing rows, and treat
 *                a concurrent unique conflict as "already created" (not fatal).
 */

import { isPerformerPipelineWriteHardeningEnabled } from './broker/brokerFlags.js';

/** Prisma unique-constraint violation. */
function isUniqueConstraintError(err) {
  return err?.code === 'P2002';
}

/**
 * Insert MissionPipelineStep rows idempotently (when hardening is enabled).
 *
 * @param {object} prisma - Prisma client (or transaction client).
 * @param {string} missionId
 * @param {Array<object>} rows - full step rows to ensure exist (each must include `orderIndex`).
 * @param {{ logPrefix?: string }} [opts]
 * @returns {Promise<{ inserted: number, skipped: number, raced?: number, mode: string }>}
 */
export async function insertMissingPipelineSteps(prisma, missionId, rows, opts = {}) {
  const logPrefix = typeof opts.logPrefix === 'string' && opts.logPrefix.trim() ? opts.logPrefix.trim() : '[PipelineSteps]';
  const data = Array.isArray(rows) ? rows : [];
  if (data.length === 0) return { inserted: 0, skipped: 0, mode: 'noop' };

  // Flag OFF → preserve exact legacy behavior (single createMany, no pre-read).
  if (!isPerformerPipelineWriteHardeningEnabled()) {
    await prisma.missionPipelineStep.createMany({ data });
    return { inserted: data.length, skipped: 0, mode: 'createMany' };
  }

  // Flag ON → idempotent insert-missing.
  const existing = await prisma.missionPipelineStep.findMany({
    where: { missionId },
    select: { orderIndex: true },
  });
  const existingIdx = new Set(existing.map((r) => r.orderIndex));
  const missing = data.filter((r) => !existingIdx.has(r.orderIndex));
  if (missing.length === 0) {
    return { inserted: 0, skipped: data.length, mode: 'all_present' };
  }

  try {
    await prisma.missionPipelineStep.createMany({ data: missing });
    return { inserted: missing.length, skipped: data.length - missing.length, mode: 'insert_missing' };
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    // A concurrent request inserted one of these (missionId, orderIndex) between our read and write.
    // Fall back to per-row inserts; treat unique conflicts as already-created (not fatal).
    let inserted = 0;
    let raced = 0;
    for (const row of missing) {
      try {
        await prisma.missionPipelineStep.create({ data: row });
        inserted += 1;
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          raced += 1;
          continue;
        }
        throw e;
      }
    }
    console.warn(
      `${logPrefix} insert-missing race on mission ${missionId}: inserted=${inserted} alreadyCreated=${raced}`,
    );
    return { inserted, skipped: data.length - missing.length, raced, mode: 'insert_missing_raced' };
  }
}

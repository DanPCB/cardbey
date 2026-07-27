// DANH: living-document-platform
/**
 * activate_campaigns — activate draft StorePromo rows for a store (document ingestion follow-up).
 */

import { getPrismaClient } from '../../prisma.js';
import { runCriticalSqliteWriteWithP1008Retry } from '../../sqliteCriticalWrite.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    '';

  if (!storeId) {
    return {
      status: 'blocked',
      blocker: { code: 'VALIDATION_ERROR', message: 'storeId is required' },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  const prisma = getPrismaClient();
  const drafts = await prisma.storePromo.findMany({
    where: { storeId, isActive: false },
    select: { id: true, title: true },
    take: 50,
  });

  if (!drafts.length) {
    return {
      status: 'ok',
      output: {
        activated: 0,
        promos: [],
        message: 'No draft promotions to activate',
        executionState: EXECUTION_STATES.EXECUTED,
      },
    };
  }

  /** @type {string[]} */
  const activatedIds = [];
  const now = new Date();

  for (const promo of drafts) {
    try {
      await runCriticalSqliteWriteWithP1008Retry(
        () =>
          prisma.storePromo.update({
            where: { id: promo.id },
            data: { isActive: true, updatedAt: now },
          }),
        { label: 'activate_campaigns', logPrefix: '[activate_campaigns]' },
      );
      activatedIds.push(promo.id);
    } catch (err) {
      console.warn('[activate_campaigns] failed for', promo.id, err?.message ?? err);
    }
  }

  return {
    status: 'ok',
    output: {
      activated: activatedIds.length,
      promos: activatedIds,
      message: `Activated ${activatedIds.length} promotion(s)`,
      executionState: EXECUTION_STATES.EXECUTED,
    },
  };
}

export default execute;

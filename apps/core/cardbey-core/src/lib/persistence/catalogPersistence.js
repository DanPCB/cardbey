/**
 * Connector-aware catalog batch persistence.
 */

import { getPrismaCatalogBatchTransactionOptions } from '../prismaTransactionOptions.js';
import { getDbCapabilities, logDbCapabilitiesOnce } from './dbCapabilityRegistry.js';
import { dedupeRowsBeforeInsert } from './catalogDedupe.js';

/**
 * Build Prisma createMany args respecting connector capabilities.
 *
 * @param {Array<Record<string, unknown>>} data
 * @param {import('./dbCapabilityTypes.js').DbCapabilities} [capabilities]
 */
export function buildProductCreateManyArgs(data, capabilities = getDbCapabilities()) {
  const args = { data };
  if (capabilities.supportsCreateManySkipDuplicates) {
    args.skipDuplicates = true;
  }
  return args;
}

/**
 * Insert product rows in chunked createMany calls (short transactions).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   businessId: string,
 *   rows: Array<Record<string, unknown>>,
 *   chunkSize?: number,
 *   dedupe?: boolean,
 *   logContext?: string,
 * }} options
 * @returns {Promise<{ written: number, batches: number, dedupeRemoved: number, mode: string }>}
 */
export async function batchInsertProducts(prisma, {
  businessId,
  rows,
  chunkSize = 50,
  dedupe = true,
  logContext,
}) {
  logDbCapabilitiesOnce();
  const capabilities = getDbCapabilities();

  let workingRows = rows.map((row) => ({ ...row, businessId }));
  let dedupeRemoved = 0;
  if (dedupe) {
    const deduped = dedupeRowsBeforeInsert(workingRows, { logContext: logContext ?? 'batch_insert' });
    workingRows = deduped.rows;
    dedupeRemoved = deduped.removedCount;
  }

  const mode = capabilities.supportsCreateManySkipDuplicates
    ? 'create_many_skip_duplicates'
    : 'create_many_client_dedupe';

  console.log(
    '[BATCH_INSERT_MODE]',
    JSON.stringify({
      mode,
      provider: capabilities.provider,
      businessId,
      rowCount: workingRows.length,
      dedupeRemoved,
      chunkSize,
      context: logContext ?? null,
    }),
  );

  if (workingRows.length === 0) {
    return { written: 0, batches: 0, dedupeRemoved, mode };
  }

  const batchOpts = getPrismaCatalogBatchTransactionOptions();
  const maxRows = capabilities.createManyMaxRows;
  let written = 0;
  let batchIndex = 0;

  for (let i = 0; i < workingRows.length; i += chunkSize) {
    const chunk = workingRows.slice(i, i + chunkSize);
    if (chunk.length > maxRows) {
      throw new Error(`Catalog batch chunk ${chunk.length} exceeds createManyMaxRows ${maxRows}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.product.createMany(buildProductCreateManyArgs(chunk, capabilities));
    }, batchOpts);
    written += chunk.length;
    batchIndex += 1;
  }

  return { written, batches: batchIndex, dedupeRemoved, mode };
}

/**
 * Replace store catalog: caller must deleteMany first; then batch insert.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Parameters<typeof batchInsertProducts>[1]} options
 */
export async function batchReplaceCatalog(prisma, options) {
  return batchInsertProducts(prisma, options);
}

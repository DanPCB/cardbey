/**
 * Staged catalog publish: prepare rows outside transactions, write products in short batched txs.
 * Used by commitDraft() and publishDraft() to avoid P2028 on large catalogs.
 */

import cuid from 'cuid';
import { normalizeCatalogItem } from '../../lib/catalog/catalogItemClassification.js';
import { normalizeServiceCatalogItem, toServiceCatalogJson } from '../../lib/catalog/serviceCatalogNormalizer.js';
import { batchInsertProducts } from '../../lib/persistence/catalogPersistence.js';
import { normalizeCatalogProductName } from '../../lib/persistence/catalogDedupe.js';
import {
  normalizeDraftProductPrice,
  resolveDraftItemImageUrl,
  resolveDraftProductCategoryName,
} from './draftStoreService.js';

const DEFAULT_CHUNK_SIZE = 50;
const WARN_CHUNK_MS = 3_000;
const WARN_SHELL_TX_MS = 5_000;
const WARN_PREVIEW_BYTES = 500_000;

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getCatalogBatchChunkSize() {
  return parsePositiveInt(process.env.COMMIT_DRAFT_CATALOG_CHUNK_SIZE, DEFAULT_CHUNK_SIZE);
}

/**
 * @param {string} stage
 * @param {Record<string, unknown>} meta
 */
export function logCommitDraftStage(stage, meta = {}) {
  const payload = {
    stage,
    itemCount: meta.itemCount ?? null,
    durationMs: meta.durationMs ?? null,
    transactionOpenMs: meta.transactionOpenMs ?? null,
    ...meta,
  };
  console.log('[COMMIT_DRAFT_STAGE]', JSON.stringify(payload));
}

export class CommitDraftStageTimer {
  constructor() {
    /** @type {number | null} */
    this._txOpenAt = null;
  }

  beginTransaction() {
    this._txOpenAt = Date.now();
  }

  endTransaction() {
    const openMs = this._txOpenAt != null ? Date.now() - this._txOpenAt : null;
    this._txOpenAt = null;
    return openMs;
  }

  /**
   * @param {string} stage
   * @param {Record<string, unknown>} [extra]
   */
  log(stage, extra = {}) {
    const transactionOpenMs = this._txOpenAt != null ? Date.now() - this._txOpenAt : extra.transactionOpenMs ?? null;
    logCommitDraftStage(stage, { transactionOpenMs, ...extra });
    if (typeof extra.durationMs === 'number' && extra.durationMs >= WARN_SHELL_TX_MS && stage.includes('shell')) {
      console.warn('[COMMIT_DRAFT_STAGE] slow_shell_transaction', { stage, durationMs: extra.durationMs });
    }
  }
}

/**
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
export function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Phase A — pure preparation (no DB).
 *
 * @param {unknown[]} commitItems
 * @param {{
 *   categoryMap: Map<string, string>,
 *   otherCategoryName: string,
 *   defaultCurrency: string,
 * }} options
 * @returns {{
 *   rows: Array<Record<string, unknown>>,
 *   publishedIdsByDraftIndex: (string|undefined)[],
 *   preparedCount: number,
 *   skippedCount: number,
 * }}
 */
export function prepareCatalogProductRows(
  commitItems,
  { categoryMap, otherCategoryName, defaultCurrency, businessType, businessName },
) {
  const rows = [];
  /** @type {(string|undefined)[]} */
  const publishedIdsByDraftIndex = Array.isArray(commitItems) ? new Array(commitItems.length) : [];
  let preparedCount = 0;
  let skippedCount = 0;
  let dedupeRemoved = 0;
  const seenNames = new Set();

  for (let i = 0; i < (commitItems?.length ?? 0); i++) {
    const item = commitItems[i];
    if (!item || typeof item !== 'object') {
      skippedCount += 1;
      continue;
    }
    const nameTrim = typeof item.name === 'string' ? item.name.trim() : '';
    if (!nameTrim) {
      skippedCount += 1;
      continue;
    }
    const nameKey = normalizeCatalogProductName(nameTrim);
    if (seenNames.has(nameKey)) {
      dedupeRemoved += 1;
      skippedCount += 1;
      continue;
    }
    seenNames.add(nameKey);
    const id = cuid();
    const imageUrl = resolveDraftItemImageUrl(item);
    const categoryName = resolveDraftProductCategoryName(item, categoryMap, otherCategoryName);
    const price = normalizeDraftProductPrice(item);
    const currency =
      item.currency != null && String(item.currency).trim()
        ? String(item.currency).trim().toUpperCase()
        : defaultCurrency;

    const classified = normalizeCatalogItem(item, { businessType, businessName });
    const serviceFields = normalizeServiceCatalogItem(
      { ...item, itemType: classified.itemType },
      { businessType, businessName, itemType: classified.itemType },
    );
    const rowPrice =
      serviceFields.serviceMode === 'quote_required'
        ? serviceFields.fromPrice ?? (price > 0 ? price : null)
        : price;
    rows.push({
      id,
      name: nameTrim,
      description: item.description || null,
      price: serviceFields.serviceMode === 'quote_required' ? null : rowPrice,
      currency,
      category: categoryName || otherCategoryName,
      imageUrl,
      isPublished: true,
      viewCount: 0,
      likeCount: 0,
      itemType: classified.itemType,
      bookingEnabled: classified.bookingEnabled,
      purchaseEnabled: classified.purchaseEnabled,
      primaryAction: classified.primaryAction,
      serviceCatalog: toServiceCatalogJson(serviceFields),
    });
    publishedIdsByDraftIndex[i] = id;
    preparedCount += 1;
  }

  if (dedupeRemoved > 0) {
    console.log(
      '[CATALOG_DEDUPE]',
      JSON.stringify({ context: 'prepare_catalog_product_rows', removedCount: dedupeRemoved }),
    );
  }

  return { rows, publishedIdsByDraftIndex, preparedCount, skippedCount, dedupeRemoved };
}

/**
 * Attach businessId to prepared rows (after shell transaction resolves store id).
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} businessId
 */
export function attachBusinessIdToProductRows(rows, businessId) {
  return rows.map((row) => ({ ...row, businessId }));
}

/**
 * Phase C — batched createMany in independent short transactions.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   businessId: string,
 *   rows: Array<Record<string, unknown>>,
 *   chunkSize?: number,
 *   timer?: CommitDraftStageTimer,
 *   draftId?: string,
 * }} options
 */
export async function replaceStoreCatalogInBatches(prisma, { businessId, rows, chunkSize, timer, draftId }) {
  const size = chunkSize ?? getCatalogBatchChunkSize();
  const t0 = Date.now();
  timer?.beginTransaction();
  let batchResult;
  try {
    batchResult = await batchInsertProducts(prisma, {
      businessId,
      rows,
      chunkSize: size,
      dedupe: true,
      logContext: draftId ? `draft:${draftId}` : 'catalog_batch',
    });
  } finally {
    const transactionOpenMs = timer?.endTransaction() ?? null;
    const durationMs = Date.now() - t0;
    timer?.log('catalog_batch_write', {
      itemCount: batchResult?.written ?? 0,
      durationMs,
      transactionOpenMs,
      totalChunks: batchResult?.batches ?? 0,
      insertMode: batchResult?.mode ?? null,
      dedupeRemoved: batchResult?.dedupeRemoved ?? 0,
      draftId: draftId ?? null,
    });
    if (durationMs >= WARN_CHUNK_MS) {
      console.warn('[COMMIT_DRAFT_STAGE] slow_catalog_batch', {
        draftId: draftId ?? null,
        businessId,
        durationMs,
        itemCount: batchResult?.written ?? 0,
      });
    }
  }

  return {
    written: batchResult.written,
    writeAmplification: {
      deleteOps: 0,
      insertOps: batchResult.written,
      batches: batchResult.batches,
      dedupeRemoved: batchResult.dedupeRemoved,
      mode: batchResult.mode,
    },
  };
}

/**
 * Roll back partial catalog writes after batch failure (store shell may remain).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {{ draftId?: string, reason?: string }} [meta]
 */
export async function rollbackPartialCatalogWrites(prisma, businessId, meta = {}) {
  const deleted = await prisma.product.deleteMany({ where: { businessId } });
  logCommitDraftStage('catalog_batch_rollback', {
    businessId,
    itemCount: deleted.count,
    draftId: meta.draftId ?? null,
    reason: meta.reason ?? 'batch_failure',
  });
  return deleted.count;
}

/**
 * @param {unknown} preview
 * @param {string} [draftId]
 */
export function logOversizedPreviewIfNeeded(preview, draftId) {
  try {
    const previewBytes = Buffer.byteLength(JSON.stringify(preview ?? {}), 'utf8');
    if (previewBytes >= WARN_PREVIEW_BYTES) {
      console.warn('[COMMIT_DRAFT_STAGE] oversized_preview', { draftId: draftId ?? null, previewBytes });
    }
    return previewBytes;
  } catch {
    return null;
  }
}

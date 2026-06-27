/**
 * prepare_catalog — load or initialize catalog structure before product upload.
 */

import { getPrismaClient } from '../../prisma.js';
import { appendBusinessEvent } from '../../business/businessEventService.js';
import { getCatalogSummary } from '../../catalog/productCatalogService.js';
import { countDraftPreviewItems, resolveCatalogScope } from '../../catalog/catalogScopeResolver.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const { storeId, draftId, userId, missionId } = resolveCatalogScope(input, context);
  const catalogName = String(input.catalogName ?? '').trim() || 'Default Catalog';

  if (!storeId && !draftId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'No store context found' },
      output: { success: false, error: 'No store context found', status: 'failed' },
    };
  }

  const prisma = getPrismaClient();
  const preparedAt = new Date().toISOString();

  try {
    if (storeId) {
      const business = await prisma.business.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, catalogLabel: true },
      });

      if (!business) {
        return {
          status: 'failed',
          error: { code: 'NOT_FOUND', message: `Store not found: ${storeId}` },
          output: { success: false, error: `Store not found: ${storeId}`, status: 'failed' },
        };
      }

      if (!business.catalogLabel?.trim()) {
        await prisma.business.update({
          where: { id: storeId },
          data: { catalogLabel: catalogName },
        });
      }

      const summary = await getCatalogSummary(prisma, storeId);

      await appendBusinessEvent(prisma, {
        storeId,
        eventType: 'catalog.prepared',
        aggregateType: 'catalog',
        aggregateId: storeId,
        payload: {
          source: 'prepare_catalog',
          catalogName: business.catalogLabel || catalogName,
          productCount: summary.total,
        },
        actorUserId: userId,
        missionId,
      });

      return {
        status: 'ok',
        output: {
          success: true,
          catalogId: storeId,
          catalogName: business.catalogLabel || catalogName,
          status: summary.total > 0 ? 'active' : 'draft',
          productCount: summary.total,
          storeId,
          nextStep: 'replace_store_catalog',
          metadata: { preparedAt, source: 'prepare_catalog' },
        },
      };
    }

    const draft = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: { id: true, preview: true, committedStoreId: true },
    });

    if (!draft) {
      return {
        status: 'failed',
        error: { code: 'NOT_FOUND', message: `Draft store not found: ${draftId}` },
        output: { success: false, error: `Draft store not found: ${draftId}`, status: 'failed' },
      };
    }

    const productCount = countDraftPreviewItems(draft.preview);

    if (draft.committedStoreId) {
      await appendBusinessEvent(prisma, {
        storeId: draft.committedStoreId,
        eventType: 'catalog.prepared',
        aggregateType: 'draft_store',
        aggregateId: draftId,
        payload: { source: 'prepare_catalog', productCount, draftId },
        actorUserId: userId,
        missionId,
      });
    }

    return {
      status: 'ok',
      output: {
        success: true,
        catalogId: draftId,
        catalogName,
        status: productCount > 0 ? 'active' : 'draft',
        productCount,
        draftId,
        storeId: draft.committedStoreId ?? null,
        nextStep: 'replace_store_catalog',
        metadata: { preparedAt, source: 'prepare_catalog' },
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { success: false, status: 'failed' },
    };
  }
}

export default execute;

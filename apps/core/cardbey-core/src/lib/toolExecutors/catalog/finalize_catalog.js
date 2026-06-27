/**
 * finalize_catalog — validate catalog readiness after products are added.
 */

import { getPrismaClient } from '../../prisma.js';
import { appendBusinessEvent } from '../../business/businessEventService.js';
import { getCatalogSummary } from '../../catalog/productCatalogService.js';
import { countDraftPreviewItems, pickString, resolveCatalogScope } from '../../catalog/catalogScopeResolver.js';

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const scope = resolveCatalogScope(input, context);
  const catalogId = pickString(input.catalogId, scope.storeId, scope.draftId);
  const storeId = pickString(scope.storeId, input.storeId);
  const draftId = pickString(scope.draftId, input.draftId);
  const { userId, missionId } = scope;

  if (!catalogId && !storeId && !draftId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'No catalog ID provided' },
      output: { success: false, error: 'No catalog ID provided', status: 'failed' },
    };
  }

  const prisma = getPrismaClient();
  const finalizedAt = new Date().toISOString();

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
          output: { success: false, status: 'failed' },
        };
      }

      const summary = await getCatalogSummary(prisma, storeId);
      if (summary.total < 1) {
        return {
          status: 'blocked',
          reason: 'catalog_empty',
          message: 'Add at least one product before finalizing the catalog',
          output: {
            success: false,
            catalogId: storeId,
            productCount: 0,
            status: 'incomplete',
          },
        };
      }

      await appendBusinessEvent(prisma, {
        storeId,
        eventType: 'catalog.finalized',
        aggregateType: 'catalog',
        aggregateId: storeId,
        payload: { source: 'finalize_catalog', productCount: summary.total },
        actorUserId: userId,
        missionId,
      });

      return {
        status: 'ok',
        output: {
          success: true,
          catalogId: storeId,
          catalogName: business.catalogLabel || 'Products',
          status: 'ready',
          productCount: summary.total,
          storeId,
          finalizedAt,
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
        output: { success: false, status: 'failed' },
      };
    }

    const productCount = countDraftPreviewItems(draft.preview);
    if (productCount < 1) {
      return {
        status: 'blocked',
        reason: 'catalog_empty',
        message: 'Add at least one product before finalizing the catalog',
        output: {
          success: false,
          catalogId: draftId,
          productCount: 0,
          status: 'incomplete',
        },
      };
    }

    if (draft.committedStoreId) {
      await appendBusinessEvent(prisma, {
        storeId: draft.committedStoreId,
        eventType: 'catalog.finalized',
        aggregateType: 'draft_store',
        aggregateId: draftId,
        payload: { source: 'finalize_catalog', productCount, draftId },
        actorUserId: userId,
        missionId,
      });
    }

    return {
      status: 'ok',
      output: {
        success: true,
        catalogId: draftId,
        status: 'ready',
        productCount,
        draftId,
        storeId: draft.committedStoreId ?? null,
        finalizedAt,
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

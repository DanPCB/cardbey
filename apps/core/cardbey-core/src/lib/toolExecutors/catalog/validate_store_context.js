/**
 * validate_store_context — confirm store or draft is accessible before catalog workflows.
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

  if (!storeId && !draftId) {
    return {
      status: 'failed',
      error: { code: 'VALIDATION_ERROR', message: 'No store context found' },
      output: {
        valid: false,
        error: 'No store context found',
        storeId: null,
        draftId: null,
        status: 'failed',
      },
    };
  }

  const prisma = getPrismaClient();

  try {
    if (storeId) {
      const business = await prisma.business.findUnique({
        where: { id: storeId },
        select: {
          id: true,
          userId: true,
          name: true,
          type: true,
          slug: true,
          isActive: true,
          catalogLabel: true,
        },
      });

      if (!business) {
        return {
          status: 'failed',
          error: { code: 'NOT_FOUND', message: `Store not found: ${storeId}` },
          output: {
            valid: false,
            error: `Store not found: ${storeId}`,
            storeId,
            status: 'failed',
          },
        };
      }

      if (userId && business.userId !== userId) {
        return {
          status: 'failed',
          error: { code: 'FORBIDDEN', message: 'Store is not accessible for this user' },
          output: {
            valid: false,
            error: 'Store is not accessible for this user',
            storeId,
            status: 'failed',
          },
        };
      }

      const summary = await getCatalogSummary(prisma, storeId);
      const validatedAt = new Date().toISOString();

      await appendBusinessEvent(prisma, {
        storeId,
        eventType: 'catalog.context_validated',
        aggregateType: 'store',
        aggregateId: storeId,
        payload: { source: 'validate_store_context', productCount: summary.total },
        actorUserId: userId,
        missionId,
      });

      return {
        status: 'ok',
        output: {
          valid: true,
          storeId: business.id,
          storeName: business.name,
          storeType: business.type,
          slug: business.slug,
          isActive: business.isActive,
          catalogLabel: business.catalogLabel,
          productCount: summary.total,
          status: 'validated',
          metadata: { validatedAt, source: 'validate_store_context' },
        },
      };
    }

    const draft = await prisma.draftStore.findUnique({
      where: { id: draftId },
      select: {
        id: true,
        ownerUserId: true,
        guestSessionId: true,
        status: true,
        preview: true,
        committedStoreId: true,
      },
    });

    if (!draft) {
      return {
        status: 'failed',
        error: { code: 'NOT_FOUND', message: `Draft store not found: ${draftId}` },
        output: {
          valid: false,
          error: `Draft store not found: ${draftId}`,
          draftId,
          status: 'failed',
        },
      };
    }

    if (userId && draft.ownerUserId && draft.ownerUserId !== userId) {
      return {
        status: 'failed',
        error: { code: 'FORBIDDEN', message: 'Draft store is not accessible for this user' },
        output: {
          valid: false,
          error: 'Draft store is not accessible for this user',
          draftId,
          status: 'failed',
        },
      };
    }

    const productCount = countDraftPreviewItems(draft.preview);
    const validatedAt = new Date().toISOString();

    if (draft.committedStoreId) {
      await appendBusinessEvent(prisma, {
        storeId: draft.committedStoreId,
        eventType: 'catalog.context_validated',
        aggregateType: 'draft_store',
        aggregateId: draftId,
        payload: { source: 'validate_store_context', productCount, draftId },
        actorUserId: userId,
        missionId,
      });
    }

    return {
      status: 'ok',
      output: {
        valid: true,
        draftId: draft.id,
        storeId: draft.committedStoreId ?? null,
        draftStatus: draft.status,
        productCount,
        status: 'validated',
        metadata: { validatedAt, source: 'validate_store_context' },
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      error: { message: err?.message ?? String(err) },
      output: { valid: false, status: 'failed' },
    };
  }
}

export default execute;

/**
 * Safe, recoverable publish wrapper around commitDraft().
 * Generation success is preserved when publish fails — caller can surface retry.
 */

import { commitDraft } from '../../services/draftStore/draftStoreService.js';
import { canAccessDraftStore } from '../draftOwnership.js';

/** Draft statuses that may still be published (enum locked — no publish_failed status). */
const PUBLISHABLE_STATUSES = new Set(['ready', 'generating', 'draft']);

/**
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   draftId: string,
 *   userId: string,
 *   missionId?: string | null,
 *   correlationId?: string | null,
 *   taskId?: string | null,
 * }} args
 * @returns {Promise<{
 *   ok: boolean,
 *   storeId?: string | null,
 *   storeSlug?: string | null,
 *   draftId?: string,
 *   error?: string,
 *   retryable?: boolean,
 *   alreadyCommitted?: boolean,
 * }>}
 */
export async function safePublishGeneratedDraft({
  prisma,
  draftId,
  userId,
  missionId,
  correlationId,
  taskId,
}) {
  const id = String(draftId ?? '').trim();
  const uid = String(userId ?? '').trim();

  if (!id || !uid) {
    return {
      ok: false,
      error: 'draftId and userId are required',
      retryable: false,
      draftId: id || undefined,
    };
  }

  const draft = await prisma.draftStore.findUnique({ where: { id } });
  if (!draft) {
    return { ok: false, error: `Draft not found: ${id}`, retryable: false, draftId: id };
  }

  const allowed = await canAccessDraftStore(draft, { userId: uid });
  if (!allowed) {
    return { ok: false, error: 'Draft access denied', retryable: false, draftId: id };
  }

  if (draft.status === 'committed') {
    let storeSlug = null;
    if (draft.committedStoreId) {
      const business = await prisma.business.findUnique({
        where: { id: draft.committedStoreId },
        select: { id: true, slug: true },
      });
      storeSlug = business?.slug ?? null;
    }
    return {
      ok: true,
      storeId: draft.committedStoreId ?? null,
      storeSlug,
      draftId: id,
      alreadyCommitted: true,
    };
  }

  const status = String(draft.status ?? '').toLowerCase();
  if (!PUBLISHABLE_STATUSES.has(status)) {
    return {
      ok: false,
      error: `Draft is not ready to publish (status: ${draft.status})`,
      retryable: false,
      draftId: id,
    };
  }

  if (status !== 'ready' && !draft.preview) {
    return {
      ok: false,
      error: `Draft is not ready to publish (status: ${draft.status}, no preview)`,
      retryable: true,
      draftId: id,
    };
  }

  try {
    const committed = await commitDraft(id, {
      userId: uid,
      acceptTerms: true,
      businessFields: { missionId: missionId ?? undefined },
    });
    return {
      ok: true,
      storeId: committed?.storeId ?? committed?.businessId ?? null,
      storeSlug: committed?.storeSlug ?? committed?.slug ?? null,
      draftId: id,
    };
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[safePublishGeneratedDraft] commitDraft failed', {
      draftId: id,
      correlationId: correlationId ?? null,
      taskId: taskId ?? null,
      error: message,
    });

    try {
      await prisma.draftStore.update({
        where: { id },
        data: {
          error: message.slice(0, 500),
          errorCode: 'PUBLISH_FAILED',
          recommendedAction: 'retry',
        },
      });
    } catch (persistErr) {
      console.warn('[safePublishGeneratedDraft] failed to persist draft error:', persistErr?.message ?? persistErr);
    }

    return {
      ok: false,
      error: message,
      retryable: true,
      draftId: id,
    };
  }
}

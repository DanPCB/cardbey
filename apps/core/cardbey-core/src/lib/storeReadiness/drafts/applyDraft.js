/**
 * Governed approve / reject / apply for ReadinessDraft (Phase 3).
 * Apply uses existing Prisma Business/Product field updates only — never publishes.
 */

import {
  appendDraftApprovalRecord,
  getReadinessDraft,
  saveReadinessDraft,
} from './draftStore.js';

/**
 * @param {string} draftId
 * @param {{ ownerUserId: string, note?: string }} input
 */
export function rejectReadinessDraft(draftId, input) {
  const draft = getReadinessDraft(draftId);
  if (!draft) return { ok: false, error: 'not_found' };
  if (draft.ownerUserId !== input.ownerUserId) return { ok: false, error: 'forbidden' };
  if (draft.status === 'applied') return { ok: false, error: 'already_applied' };

  draft.status = 'rejected';
  draft.updatedAt = new Date().toISOString();
  draft.approval = {
    state: 'rejected',
    by: input.ownerUserId,
    at: draft.updatedAt,
    note: input.note || null,
  };
  saveReadinessDraft(draft);
  appendDraftApprovalRecord({
    draftId: draft.id,
    storeId: draft.storeId,
    ownerUserId: input.ownerUserId,
    action: 'rejected',
    timestamp: draft.updatedAt,
    sourceDraftId: draft.id,
    note: input.note || null,
  });
  return { ok: true, draft };
}

/**
 * Mark approved (still not applied).
 * @param {string} draftId
 * @param {{ ownerUserId: string, note?: string }} input
 */
export function approveReadinessDraft(draftId, input) {
  const draft = getReadinessDraft(draftId);
  if (!draft) return { ok: false, error: 'not_found' };
  if (draft.ownerUserId !== input.ownerUserId) return { ok: false, error: 'forbidden' };
  if (draft.status === 'applied') return { ok: false, error: 'already_applied' };
  if (draft.status === 'rejected') return { ok: false, error: 'rejected' };

  const now = new Date().toISOString();
  draft.status = 'approved';
  draft.updatedAt = now;
  draft.approval = {
    state: 'approved',
    by: input.ownerUserId,
    at: now,
    note: input.note || null,
    ownerConfirmed: true,
  };
  saveReadinessDraft(draft);
  appendDraftApprovalRecord({
    draftId: draft.id,
    storeId: draft.storeId,
    ownerUserId: input.ownerUserId,
    action: 'approved',
    timestamp: now,
    sourceDraftId: draft.id,
    note: input.note || null,
  });
  return { ok: true, draft };
}

/**
 * Apply approved draft via existing mutation surfaces (Prisma field updates).
 * Does NOT publish, change prices, or enable visibility.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} draftId
 * @param {{ ownerUserId: string, note?: string }} input
 */
export async function applyReadinessDraft(prisma, draftId, input) {
  const draft = getReadinessDraft(draftId);
  if (!draft) return { ok: false, error: 'not_found' };
  if (draft.ownerUserId !== input.ownerUserId) return { ok: false, error: 'forbidden' };

  // Require explicit approval first
  if (draft.status !== 'approved' && draft.approval?.state !== 'approved') {
    return { ok: false, error: 'approval_required' };
  }

  const business = await prisma.business.findUnique({
    where: { id: draft.storeId },
    select: { id: true, userId: true },
  });
  if (!business) return { ok: false, error: 'store_not_found' };
  if (business.userId !== input.ownerUserId) return { ok: false, error: 'forbidden' };

  const field = String(draft.content?.field || '');
  const text = draft.content?.text != null ? String(draft.content.text) : null;

  try {
    if (
      (draft.draftType === 'product_description' || draft.draftType === 'service_description') &&
      draft.content?.productId
    ) {
      await prisma.product.update({
        where: { id: String(draft.content.productId) },
        data: { description: text },
      });
    } else if (draft.draftType === 'cta_text' || field === 'ctaLabel') {
      await prisma.business.update({
        where: { id: draft.storeId },
        data: { ctaLabel: text || 'Order now' },
      });
    } else if (draft.draftType === 'hero_headline' || field === 'tagline') {
      await prisma.business.update({
        where: { id: draft.storeId },
        data: { tagline: text },
      });
    } else if (draft.draftType === 'hero_subheading' || field === 'heroText') {
      await prisma.business.update({
        where: { id: draft.storeId },
        data: { heroText: text },
      });
    } else if (draft.draftType === 'business_description' || field === 'description') {
      await prisma.business.update({
        where: { id: draft.storeId },
        data: { description: text },
      });
    } else if (draft.draftType === 'faq' || draft.draftType === 'campaign_copy' || draft.draftType === 'loyalty_introduction') {
      // Persist under storefrontSettings JSON — non-publishing enrichment only
      const current = await prisma.business.findUnique({
        where: { id: draft.storeId },
        select: { storefrontSettings: true },
      });
      const settings =
        current?.storefrontSettings && typeof current.storefrontSettings === 'object'
          ? { ...current.storefrontSettings }
          : {};
      settings.readinessDrafts = settings.readinessDrafts || {};
      settings.readinessDrafts[draft.draftType] = {
        content: draft.content,
        appliedAt: new Date().toISOString(),
        draftId: draft.id,
      };
      await prisma.business.update({
        where: { id: draft.storeId },
        data: { storefrontSettings: settings },
      });
    } else {
      return { ok: false, error: 'unsupported_draft_type' };
    }
  } catch (err) {
    return {
      ok: false,
      error: 'apply_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const now = new Date().toISOString();
  draft.status = 'applied';
  draft.updatedAt = now;
  draft.approval = {
    ...(draft.approval || {}),
    state: 'applied',
    appliedAt: now,
    appliedBy: input.ownerUserId,
    ownerConfirmed: true,
    sourceDraftId: draft.id,
  };
  saveReadinessDraft(draft);
  appendDraftApprovalRecord({
    draftId: draft.id,
    storeId: draft.storeId,
    ownerUserId: input.ownerUserId,
    action: 'applied',
    timestamp: now,
    sourceDraftId: draft.id,
    note: input.note || null,
  });

  return { ok: true, draft, mutation: { published: false, path: 'existing_prisma_update' } };
}

/**
 * Persist acceptance onto DraftStore.preview.meta (no schema migration).
 */

import { getPrismaClient } from '../../prisma.js';
import { decideProjectionAcceptance } from './acceptProjectionForDraft.js';
import { buildOwnerProjectionComparison } from './buildOwnerComparison.js';

/**
 * Extract a catalog-like object from a draft row for design-library ops.
 * @param {object} draft
 */
export function catalogFromDraft(draft) {
  const preview = draft?.preview && typeof draft.preview === 'object' ? draft.preview : {};
  const metaFromPreview = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  const products =
    (Array.isArray(draft?.catalog?.products) && draft.catalog.products) ||
    (Array.isArray(preview.items) && preview.items) ||
    (Array.isArray(preview.products) && preview.products) ||
    [];

  return {
    products,
    profile: {
      name: draft?.input?.businessName ?? preview.storeName ?? preview.businessName,
    },
    preview,
    meta: {
      ...metaFromPreview,
      ...(draft?.catalog?.meta && typeof draft.catalog.meta === 'object' ? draft.catalog.meta : {}),
      primaryCTA: metaFromPreview.primaryCTA ?? preview.primaryCTA,
    },
  };
}

/**
 * @param {string} draftId
 * @param {{
 *   decision: 'accept'|'reject',
 *   confirm: boolean,
 *   applyToDraftPreview?: boolean,
 *   note?: string,
 *   actorUserId?: string|null,
 * }} decision
 * @param {Record<string, unknown>} [context]
 */
export async function persistProjectionAcceptanceDecision(draftId, decision, context = {}) {
  const prisma = getPrismaClient();
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft) {
    return { ok: false, error: 'draft_not_found', draft: null, acceptance: null };
  }

  const catalog = catalogFromDraft(draft);
  const result = decideProjectionAcceptance(
    catalog,
    {
      ...decision,
      actorUserId: decision.actorUserId,
    },
    {
      ...context,
      draftStoreId: draftId,
      phone: context.phone ?? draft.preview?.phone ?? draft.input?.phone,
      bookingUrl: context.bookingUrl ?? draft.preview?.bookingUrl,
      businessName: context.businessName ?? draft.input?.businessName,
      legacyStore: {
        products: catalog.products,
        preview: draft.preview,
        meta: catalog.meta,
        primaryCTA: catalog.meta?.primaryCTA,
        websiteTemplateId: draft.websiteTemplateId ?? draft.preview?.websiteTemplateId,
        contentTemplateId: draft.contentTemplateId ?? draft.preview?.contentTemplateId,
        theme: draft.preview?.website?.theme,
      },
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error: 'acceptance_rejected',
      errors: result.errors,
      draft,
      acceptance: null,
      comparison: result.comparison,
    };
  }

  const prevPreview =
    draft.preview && typeof draft.preview === 'object' ? { ...draft.preview } : {};
  const prevMeta =
    prevPreview.meta && typeof prevPreview.meta === 'object' ? { ...prevPreview.meta } : {};

  const nextPreview = {
    ...prevPreview,
    meta: {
      ...prevMeta,
      ...result.catalog.meta,
      designLibraryProjectionAcceptance: result.acceptance,
    },
  };

  const updated = await prisma.draftStore.update({
    where: { id: draftId },
    data: { preview: nextPreview },
  });

  return {
    ok: true,
    draft: updated,
    acceptance: result.acceptance,
    comparison: result.comparison,
    errors: [],
  };
}

/**
 * @param {string} draftId
 * @param {Record<string, unknown>} [context]
 */
export async function loadOwnerProjectionComparisonForDraft(draftId, context = {}) {
  const prisma = getPrismaClient();
  const draft = await prisma.draftStore.findUnique({ where: { id: draftId } });
  if (!draft) {
    return { ok: false, error: 'draft_not_found', comparison: null, draft: null };
  }
  const catalog = catalogFromDraft(draft);
  const comparison = buildOwnerProjectionComparison(catalog, {
    ...context,
    draftStoreId: draftId,
    phone: context.phone ?? draft.preview?.phone ?? draft.input?.phone,
    bookingUrl: context.bookingUrl ?? draft.preview?.bookingUrl,
    businessName: context.businessName ?? draft.input?.businessName,
    legacyStore: {
      products: catalog.products,
      preview: draft.preview,
      meta: catalog.meta,
      primaryCTA: catalog.meta?.primaryCTA,
      websiteTemplateId: draft.websiteTemplateId ?? draft.preview?.websiteTemplateId,
      contentTemplateId: draft.contentTemplateId ?? draft.preview?.contentTemplateId,
      theme: draft.preview?.website?.theme,
    },
  });
  return { ok: true, draft, comparison, catalog };
}

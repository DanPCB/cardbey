/**
 * Build read-only offer draft artifacts (no publish, activate, or StoreOffer persistence).
 */
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../../prisma.js';
import { getDraft, getDraftByGenerationRunId } from '../../../services/draftStore/draftStoreService.js';

function parseDraftPreviewItems(preview) {
  if (!preview) return [];
  let p = preview;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      return [];
    }
  }
  if (!p || typeof p !== 'object') return [];
  return Array.isArray(p.items) ? p.items : [];
}

function normalizeCatalogItem(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? raw.title ?? '').trim();
  if (!name) return null;
  const priceRaw = raw.price ?? raw.unitPrice;
  const price =
    typeof priceRaw === 'number'
      ? priceRaw
      : typeof priceRaw === 'string'
        ? parseFloat(priceRaw.replace(/[^0-9.]/g, ''))
        : undefined;
  return {
    id: String(raw.id ?? raw.productId ?? `item-${idx}`).trim(),
    name,
    ...(Number.isFinite(price) ? { price } : {}),
    ...(typeof raw.imageUrl === 'string' && raw.imageUrl.trim()
      ? { imageUrl: raw.imageUrl.trim() }
      : {}),
    ...(typeof raw.category === 'string' && raw.category.trim()
      ? { category: raw.category.trim() }
      : {}),
  };
}

/**
 * @param {object} params
 * @param {string} params.storeId
 * @param {string} [params.missionId]
 * @param {string} [params.draftId]
 * @param {string} [params.generationRunId]
 * @param {Array<object>} [params.selectedProducts]
 */
export async function loadCatalogProductsForOffer(params) {
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() : '';
  if (!storeId) return [];

  const selected = Array.isArray(params.selectedProducts)
    ? params.selectedProducts.map(normalizeCatalogItem).filter(Boolean)
    : [];
  if (selected.length > 0) return selected;

  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({ where: { id: storeId } });
  if (!store) return [];

  let dbProducts = await prisma.product.findMany({
    where: { businessId: storeId, deletedAt: null },
    take: 24,
    orderBy: { updatedAt: 'desc' },
  });

  if (dbProducts.length > 0) {
    return dbProducts.map((p, idx) =>
      normalizeCatalogItem(
        {
          id: p.id,
          name: p.name,
          price: p.price,
          imageUrl: p.imageUrl,
          category: p.category,
        },
        idx,
      ),
    ).filter(Boolean);
  }

  const generationRunId =
    typeof params.generationRunId === 'string' ? params.generationRunId.trim() : '';
  const draftId = typeof params.draftId === 'string' ? params.draftId.trim() : '';

  const tryDraft = async (draft) => {
    if (!draft) return [];
    const preview =
      typeof draft.preview === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.preview);
            } catch {
              return {};
            }
          })()
        : draft.preview ?? {};
    return parseDraftPreviewItems(preview)
      .map(normalizeCatalogItem)
      .filter(Boolean);
  };

  if (generationRunId) {
    try {
      const draft = await getDraftByGenerationRunId(generationRunId);
      const items = await tryDraft(draft);
      if (items.length) return items;
    } catch {
      /* ignore */
    }
  }

  if (draftId) {
    try {
      const draft = await getDraft(draftId);
      const items = await tryDraft(draft);
      if (items.length) return items;
    } catch {
      /* ignore */
    }
  }

  return [];
}

/**
 * @param {object} params
 * @param {string} params.missionId
 * @param {string} params.storeId
 * @param {string} [params.storeName]
 * @param {Array<object>} products
 */
export function buildOfferDraftArtifact(params, products) {
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() : '';
  const storeName = String(params.storeName ?? 'Your store').trim() || 'Your store';
  const featured = (products ?? []).slice(0, 6);
  const primaryName = featured[0]?.name ?? 'featured items';
  const proposedDiscount = featured.length >= 3 ? '15% off' : '10% off';
  const title = `First offer — ${proposedDiscount} at ${storeName}`;
  const productList =
    featured.length > 0
      ? featured.map((p) => p.name).join(', ')
      : 'your catalog highlights';
  const offerCopy = `Introduce new customers to ${storeName} with ${proposedDiscount} on ${productList}. This is a draft for your review — nothing is published until you approve a future publish step.`;

  const artifactId = `offer-draft:${missionId || storeId}:${randomUUID().slice(0, 8)}`;
  return {
    artifactId,
    type: 'offer_draft',
    title,
    offerCopy,
    featuredProducts: featured,
    proposedDiscount,
    cta: 'Shop this offer',
    status: 'review_required',
    storeId,
    requiresUserApproval: true,
    publishBlocked: true,
    versionNumber: 1,
    previousVersionId: null,
    revisionReason: null,
    createdFromExecutionId: null,
    versionChainId: artifactId,
  };
}

/**
 * Build a new offer draft version from a previous artifact + revision notes (no publish).
 *
 * @param {object} params
 * @param {object} params.previousOfferDraft
 * @param {string} params.revisionNotes
 * @param {string} params.createdFromExecutionId
 * @param {string} params.missionId
 * @param {string} params.storeId
 * @param {string} [params.storeName]
 * @param {Array<object>} [params.products]
 */
export function buildRevisedOfferDraftArtifact(params) {
  const previous = params.previousOfferDraft ?? {};
  const notes = String(params.revisionNotes ?? '').trim();
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() : '';
  const storeName = String(params.storeName ?? 'Your store').trim() || 'Your store';
  const prevVersion = typeof previous.versionNumber === 'number' ? previous.versionNumber : 1;
  const versionNumber = prevVersion + 1;
  const versionChainId =
    typeof previous.versionChainId === 'string' && previous.versionChainId.trim()
      ? previous.versionChainId.trim()
      : typeof previous.artifactId === 'string'
        ? previous.artifactId.trim()
        : null;

  const products =
    Array.isArray(params.products) && params.products.length > 0
      ? params.products
      : Array.isArray(previous.featuredProducts)
        ? previous.featuredProducts
        : [];
  const featured = products.slice(0, 6);
  const proposedDiscount = previous.proposedDiscount ?? (featured.length >= 3 ? '15% off' : '10% off');
  const productList =
    featured.length > 0
      ? featured.map((p) => p.name).join(', ')
      : 'your catalog highlights';

  const title = `Revised offer (v${versionNumber}) — ${proposedDiscount} at ${storeName}`;
  const offerCopy = `${storeName} offer draft v${versionNumber}. ${notes ? `Changes requested: ${notes}. ` : ''}Featuring ${productList}. This revised draft requires your review — nothing is published or activated.`;

  const artifactId = `offer-draft:${missionId || storeId}:v${versionNumber}:${randomUUID().slice(0, 8)}`;

  return {
    artifactId,
    type: 'offer_draft',
    title,
    offerCopy,
    featuredProducts: featured,
    proposedDiscount,
    cta: previous.cta ?? 'Shop this offer',
    status: 'review_required',
    storeId: storeId || previous.storeId,
    requiresUserApproval: true,
    publishBlocked: true,
    versionNumber,
    previousVersionId: previous.artifactId ?? null,
    revisionReason: notes || 'Revision requested',
    createdFromExecutionId: params.createdFromExecutionId ?? null,
    versionChainId: versionChainId ?? previous.artifactId ?? artifactId,
    reviewDecision: undefined,
    reviewedAt: undefined,
    revisionNotes: undefined,
  };
}

/**
 * @param {object} params
 */
export async function executeReviseOfferDraftBuild(params) {
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() : '';
  const notes = String(params.revisionNotes ?? '').trim();
  const previous = params.previousOfferDraft;

  if (!missionId) {
    return { ok: false, status: 'failed', error: 'mission_id_required', code: 'mission_id_required' };
  }
  if (!storeId) {
    return { ok: false, status: 'blocked', error: 'store_id_required', code: 'store_id_required' };
  }
  if (!previous || typeof previous !== 'object') {
    return {
      ok: false,
      status: 'failed',
      error: 'previous_offer_draft_required',
      code: 'previous_offer_draft_required',
    };
  }
  if (!notes) {
    return {
      ok: false,
      status: 'blocked',
      error: 'revision_notes_required',
      code: 'revision_notes_required',
    };
  }

  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({ where: { id: storeId } });
  const storeName = store?.name ?? params.storeName ?? 'Your store';

  const products = await loadCatalogProductsForOffer({
    storeId,
    missionId,
    draftId: params.draftId,
    generationRunId: params.generationRunId,
    selectedProducts: params.selectedProducts,
  });

  const offerDraft = buildRevisedOfferDraftArtifact({
    previousOfferDraft: previous,
    revisionNotes: notes,
    createdFromExecutionId: params.createdFromExecutionId ?? null,
    missionId,
    storeId,
    storeName,
    products,
  });

  return {
    ok: true,
    status: 'completed',
    output: {
      offerDraft,
      previousOfferDraftId: previous.artifactId,
      versionNumber: offerDraft.versionNumber,
      published: false,
      activated: false,
    },
  };
}

/**
 * @param {object} params
 */
export async function executeCreateOfferDraftBuild(params) {
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() : '';

  if (!missionId) {
    return { ok: false, status: 'failed', error: 'mission_id_required', code: 'mission_id_required' };
  }
  if (!storeId) {
    return {
      ok: false,
      status: 'blocked',
      error: 'store_id_required',
      code: 'store_id_required',
    };
  }

  const prisma = getPrismaClient();
  const store = await prisma.business.findUnique({ where: { id: storeId } });
  const storeName = store?.name ?? params.storeName ?? 'Your store';

  const products = await loadCatalogProductsForOffer({
    storeId,
    missionId,
    draftId: params.draftId,
    generationRunId: params.generationRunId,
    selectedProducts: params.selectedProducts,
  });

  const offerDraft = buildOfferDraftArtifact(
    { missionId, storeId, storeName },
    products,
  );

  return {
    ok: true,
    status: 'completed',
    output: {
      offerDraft,
      productCount: products.length,
      published: false,
      activated: false,
    },
  };
}

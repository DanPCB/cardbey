/**
 * Owner review for research-backed store catalog (accept / edit / fallback).
 */
import { applyOwnerDecisionToEvidence } from '../../lib/researchEvidence/researchEvidenceRepository.js';

/**
 * @param {string} missionId
 * @param {Record<string, unknown>} payload
 */
export async function emitStoreResearchReviewArtifact(missionId, payload) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  try {
    const { broadcastMissionArtifact } = await import('../../realtime/simpleSse.js');
    broadcastMissionArtifact({
      missionId: mid,
      subtype: 'store_research_review_required',
      payload: {
        type: 'store_research_review_required',
        missionId: mid,
        ...payload,
      },
    });
  } catch (err) {
    console.warn('[storeResearchReview] mission.artifact SSE failed:', err?.message ?? err);
  }
}

/**
 * @param {string} missionId
 * @param {string} message
 */
export async function emitStoreResearchConfirmedArtifact(missionId, message) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  try {
    const { broadcastMissionArtifact } = await import('../../realtime/simpleSse.js');
    broadcastMissionArtifact({
      missionId: mid,
      subtype: 'store_research_confirmed',
      payload: {
        type: 'store_research_confirmed',
        missionId: mid,
        message: message || 'Research catalog accepted.',
      },
    });
  } catch (err) {
    console.warn('[storeResearchReview] confirmed artifact SSE failed:', err?.message ?? err);
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 */
async function loadMissionContext(prisma, missionId) {
  const row = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { context: true },
  });
  return row?.context && typeof row.context === 'object' ? { ...row.context } : {};
}

/**
 * @param {Record<string, unknown>} ctx
 */
function resolveDraftIdFromContext(ctx) {
  const entities =
    ctx.entities && typeof ctx.entities === 'object' && !Array.isArray(ctx.entities)
      ? ctx.entities
      : {};
  const candidates = [
    ctx.draftId,
    ctx.draftStoreId,
    ctx.miniWebsiteDraftId,
    entities.draftId,
    entities.draftStoreId,
    entities.miniWebsiteDraftId,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/**
 * @param {unknown[]} services
 */
function normalizeReviewServices(services) {
  if (!Array.isArray(services)) return [];
  return services
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') return null;
      const s = /** @type {Record<string, unknown>} */ (raw);
      const name = typeof s.name === 'string' ? s.name.trim() : '';
      if (!name) return null;
      const priceRaw = s.price;
      const price =
        typeof priceRaw === 'number' && Number.isFinite(priceRaw)
          ? priceRaw
          : typeof priceRaw === 'string' && Number.isFinite(Number(priceRaw))
            ? Number(priceRaw)
            : null;
      const durationRaw = s.durationMinutes;
      const durationMinutes =
        typeof durationRaw === 'number' && Number.isFinite(durationRaw)
          ? durationRaw
          : typeof durationRaw === 'string' && Number.isFinite(Number(durationRaw))
            ? Number(durationRaw)
            : null;
      return {
        id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `svc_${index}`,
        name,
        price,
        durationMinutes,
        confidence: typeof s.confidence === 'number' ? s.confidence : null,
        sourceType: typeof s.sourceType === 'string' ? s.sourceType : null,
        serviceMode: typeof s.serviceMode === 'string' ? s.serviceMode : null,
        executionAction: typeof s.executionAction === 'string' ? s.executionAction : null,
        category: typeof s.category === 'string' ? s.category : undefined,
      };
    })
    .filter(Boolean);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} draftId
 * @param {ReturnType<typeof normalizeReviewServices>} services
 * @param {Record<string, unknown>} ctx
 */
async function patchDraftCatalogFromServices(prisma, draftId, services, ctx) {
  const { buildCatalogFromPreloadedItems } = await import('../draftStore/preloadedCatalogFromItems.js');
  const row = await prisma.draftStore
    .findUnique({ where: { id: draftId }, select: { preview: true, input: true } })
    .catch(() => null);
  if (!row) return { ok: false, error: 'draft_not_found' };

  const preview = row.preview && typeof row.preview === 'object' ? row.preview : {};
  const input = row.input && typeof row.input === 'object' ? row.input : {};
  const businessName =
    (typeof preview.storeName === 'string' && preview.storeName.trim()) ||
    (typeof input.businessName === 'string' && input.businessName.trim()) ||
    '';
  const verticalSlug =
    (typeof input.vertical === 'string' && input.vertical) ||
    (typeof input.businessType === 'string' && input.businessType) ||
    null;

  const preloaded = services.map((s) => ({
    name: s.name,
    price: s.price ?? 0,
    category: s.category,
    serviceMode: s.serviceMode,
    executionAction: s.executionAction,
    durationMinutes: s.durationMinutes,
  }));

  const catalog = buildCatalogFromPreloadedItems(preloaded, {
    businessName,
    verticalSlug,
    currencyCode: ctx.currencyCode ?? input.currencyCode ?? 'AUD',
    businessType: input.businessType ?? null,
  });

  const nextPreview = {
    ...preview,
    categories: catalog.categories ?? [],
    items: catalog.products ?? [],
  };

  await prisma.draftStore.update({
    where: { id: draftId },
    data: { preview: nextPreview },
  });

  return { ok: true, itemCount: catalog.products?.length ?? 0 };
}

/**
 * Replace researched catalog with industry AI starter after owner chooses AI generate.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} draftId
 * @param {Record<string, unknown>} ctx
 */
async function patchDraftWithAiStarterCatalog(prisma, draftId, ctx) {
  const { buildIndustryCatalog } = await import('../draftStore/industryBlueprintRegistry.js');
  const { resolveVertical } = await import('../../lib/verticals/verticalTaxonomy.js');

  const row = await prisma.draftStore
    .findUnique({ where: { id: draftId }, select: { preview: true, input: true } })
    .catch(() => null);
  if (!row) return { ok: false, error: 'draft_not_found' };

  const preview = row.preview && typeof row.preview === 'object' ? { ...row.preview } : {};
  const input = row.input && typeof row.input === 'object' ? row.input : {};
  const businessName =
    (typeof input.businessName === 'string' && input.businessName.trim()) ||
    (typeof preview.storeName === 'string' && preview.storeName.trim()) ||
    '';
  const businessType =
    (typeof input.businessType === 'string' && input.businessType.trim()) ||
    (typeof input.category === 'string' && input.category.trim()) ||
    (typeof preview.storeType === 'string' && preview.storeType.trim()) ||
    '';
  const vertical = resolveVertical({ businessName, businessType });
  const catalog = buildIndustryCatalog(
    {
      businessName,
      storeName: businessName,
      businessType,
      storeType: businessType,
      verticalSlug: vertical?.slug ?? input.verticalSlug ?? null,
      verticalGroup: vertical?.group ?? null,
      creationMode: 'NEW_BUSINESS',
      allowBlueprintPrices: false,
      hasPriceList: false,
    },
    24,
  );

  const rawItems = Array.isArray(catalog?.products)
    ? catalog.products
    : Array.isArray(catalog?.items)
      ? catalog.items
      : [];
  if (!rawItems.length) return { ok: false, error: 'ai_starter_empty' };

  const isFloristOrRetail =
    /\b(florist|flowers?|floral|retail|boutique)\b/i.test(
      `${businessName} ${businessType} ${vertical?.slug || ''}`,
    ) ||
    String(vertical?.slug || '').includes('flower') ||
    String(catalog?.meta?.vertical || '').includes('flower');

  const items = rawItems.map((it, index) => {
    const rowItem = it && typeof it === 'object' ? { ...it } : { name: `Item ${index + 1}` };
    return {
      ...rowItem,
      id: rowItem.id || `item_starter_${index}`,
      contentOrigin: 'suggested',
      catalogSource: 'ai_generated_starter',
      ...(isFloristOrRetail
        ? {
            itemType: 'product',
            kind: 'product',
            type: 'product',
            contentRole: 'product',
            executionAction: 'add_to_cart',
            primaryAction: 'add_to_cart',
            bookingEnabled: false,
            purchaseEnabled: true,
            priceStatus: rowItem.priceStatus || 'UNKNOWN',
            priceDisplay: rowItem.priceDisplay || 'Price on request',
          }
        : {}),
    };
  });

  const nextPreview = {
    ...preview,
    storeName: businessName || preview.storeName,
    categories: catalog.categories ?? preview.categories ?? [],
    items,
    products: items,
    meta: {
      ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      catalogSource: 'ai_generated_starter',
      creationMode: 'NEW_BUSINESS',
      contentOrigin: 'suggested',
    },
  };

  await prisma.draftStore.update({
    where: { id: draftId },
    data: {
      preview: nextPreview,
      input: {
        ...input,
        creationMode: 'NEW_BUSINESS',
        verticalSlug: vertical?.slug ?? input.verticalSlug,
      },
    },
  });

  try {
    const { fillMissingDraftItemImages } = await import('../draftStore/fillMissingDraftItemImages.js');
    if (typeof fillMissingDraftItemImages === 'function') {
      const refreshed = await prisma.draftStore
        .findUnique({ where: { id: draftId }, select: { preview: true } })
        .catch(() => null);
      const pv = refreshed?.preview && typeof refreshed.preview === 'object' ? refreshed.preview : nextPreview;
      const fillItems = Array.isArray(pv.items) ? pv.items : items;
      await fillMissingDraftItemImages({
        items: fillItems,
        categories: pv.categories ?? nextPreview.categories,
        storeName: businessName,
        storeType: businessType,
        maxItems: 24,
      }).catch(() => {});
      await prisma.draftStore
        .update({
          where: { id: draftId },
          data: {
            preview: {
              ...pv,
              items: fillItems,
              products: fillItems,
            },
          },
        })
        .catch(() => {});
    }
  } catch {
    /* optional */
  }

  return { ok: true, itemCount: items.length };
}

/**
 * @param {{
 *   missionId: string;
 *   action: 'accept' | 'reject_fallback';
 *   services?: unknown[];
 *   prisma?: import('@prisma/client').PrismaClient;
 * }} params
 */
export async function applyStoreResearchReviewDecision(params) {
  const { getPrismaClient } = await import('../../lib/prisma.js');
  const prisma = params.prisma || getPrismaClient();
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  if (!missionId) return { ok: false, error: 'mission_id_required' };

  const action = params.action === 'reject_fallback' ? 'reject_fallback' : 'accept';
  const ctx = await loadMissionContext(prisma, missionId);
  const research =
    ctx.storeCreationResearch && typeof ctx.storeCreationResearch === 'object'
      ? { ...ctx.storeCreationResearch }
      : null;

  if (!research) {
    return { ok: false, reason: 'no_pending_research', error: 'No research review is pending for this mission' };
  }
  if (research.ownerConfirmed === true) {
    return { ok: false, reason: 'already_confirmed', error: 'Research catalog was already accepted' };
  }

  const draftId = resolveDraftIdFromContext(ctx);
  const incomingServices = normalizeReviewServices(
    Array.isArray(params.services) && params.services.length
      ? params.services
      : research.extractedServices,
  );

  if (action === 'reject_fallback') {
    let rebuild = { ok: true, itemCount: 0 };
    if (draftId) {
      rebuild = await patchDraftWithAiStarterCatalog(prisma, draftId, ctx);
      if (!rebuild.ok) {
        console.warn('[storeResearchReview] AI starter rebuild failed:', rebuild.error);
      }
    }
    const nextCtx = applyOwnerDecisionToEvidence({
      ...ctx,
      storeCreationResearch: {
        ...research,
        ownerConfirmed: false,
        ownerRejected: true,
        reviewStatus: 'rejected_fallback',
        rejectedAt: new Date().toISOString(),
        aiStarterItemCount: rebuild.itemCount ?? 0,
      },
      preloadedCatalogItems: [],
    }, action);
    await prisma.mission.update({ where: { id: missionId }, data: { context: nextCtx } }).catch(() => {});
    await emitStoreResearchConfirmedArtifact(
      missionId,
      rebuild.ok && rebuild.itemCount
        ? `Using AI-generated catalog (${rebuild.itemCount} items). Draft updated — refresh preview.`
        : 'Using AI-generated catalog instead. Re-run store build to refresh your menu.',
    );
    return {
      ok: true,
      action,
      rejected: true,
      rebuiltWithAiStarter: Boolean(rebuild.ok && rebuild.itemCount),
      itemCount: rebuild.itemCount ?? 0,
    };
  }

  if (!incomingServices.length) {
    return { ok: false, error: 'no_services', message: 'Add at least one service before accepting' };
  }

  if (draftId) {
    const patch = await patchDraftCatalogFromServices(prisma, draftId, incomingServices, ctx);
    if (!patch.ok) {
      return { ok: false, error: patch.error || 'draft_patch_failed' };
    }
  }

  const nextCtx = applyOwnerDecisionToEvidence({
    ...ctx,
    preloadedCatalogItems: incomingServices.map((s) => ({
      name: s.name,
      price: s.price ?? 0,
      category: s.category,
      serviceMode: s.serviceMode,
      executionAction: s.executionAction,
      durationMinutes: s.durationMinutes,
    })),
    storeCreationResearch: {
      ...research,
      extractedServices: incomingServices,
      ownerConfirmed: true,
      ownerRejected: false,
      reviewStatus: 'accepted',
      confirmedAt: new Date().toISOString(),
    },
  }, action, incomingServices);

  try {
    const { freezeStoreCreationMissionContract, buildStoreCreationMissionContract } = await import(
      '../../lib/storeResearch/missionContract.js'
    );
    const { markProvenanceOwnerConfirmed } = await import('../../lib/storeResearch/provenancePersistence.js');
    const existingContract = ctx.storeCreationMissionContract ?? research.storeResearchPipeline?.missionContract;
    const evidenceId =
      existingContract?.evidenceId ??
      ctx.storeResearchProvenance?.evidenceId ??
      research.storeResearchPipeline?.evidence?.evidenceId ??
      '';
    nextCtx.storeCreationMissionContract = freezeStoreCreationMissionContract(
      existingContract ??
        buildStoreCreationMissionContract({
          evidenceId,
          approvedSources: [],
          executionContext: { missionId, draftId },
          contentPolicy: {
            sourcedFieldsApproved: true,
            suggestedFieldsApproved: Boolean(params.suggestedFieldsApproved),
          },
        }),
    );
    if (nextCtx.storeResearchProvenance) {
      nextCtx.storeResearchProvenance = markProvenanceOwnerConfirmed(nextCtx.storeResearchProvenance);
    }
  } catch {
    /* optional module */
  }

  await prisma.mission.update({ where: { id: missionId }, data: { context: nextCtx } }).catch(() => {});
  await emitStoreResearchConfirmedArtifact(
    missionId,
  `Accepted ${incomingServices.length} researched service${incomingServices.length === 1 ? '' : 's'}.`,
  );

  return { ok: true, action, accepted: true, serviceCount: incomingServices.length, draftId };
}

/**
 * Build artifact payload from persisted mission research context.
 * @param {string} missionId
 * @param {Record<string, unknown>} research
 * @param {{ draftId?: string|null }} [meta]
 */
export function buildStoreResearchReviewArtifactPayload(missionId, research, meta = {}) {
  const pipeline = research.storeResearchPipeline && typeof research.storeResearchPipeline === 'object'
    ? research.storeResearchPipeline
    : null;
  const reviewArtifact = pipeline?.reviewArtifact ?? meta.reviewArtifact ?? null;

  return {
    artifactType: reviewArtifact?.artifactType ?? 'store_research_review',
    ownerReviewRequired: Boolean(research.ownerReviewRequired ?? reviewArtifact?.requiresOwnerConfirmation),
    confidence:
      typeof research.confidence === 'number'
        ? research.confidence
        : reviewArtifact?.confidence ?? null,
    sourcesUsed: Array.isArray(research.sourcesUsed) ? research.sourcesUsed : reviewArtifact?.sourcesUsed ?? [],
    sourcesPendingConfirmation: Array.isArray(research.sourcesPendingConfirmation)
      ? research.sourcesPendingConfirmation
      : [],
    extractedServices: Array.isArray(research.extractedServices)
      ? research.extractedServices
      : reviewArtifact?.extractedCatalog ?? [],
    suggestedItems: reviewArtifact?.suggestedItems ?? [],
    matchedBusiness: reviewArtifact?.matchedBusiness ?? pipeline?.entityResolution?.selectedCandidate ?? null,
    candidates: reviewArtifact?.candidates ?? pipeline?.entityResolution?.candidates ?? [],
    conflicts: reviewArtifact?.conflicts ?? [],
    missingFields: reviewArtifact?.missingFields ?? [],
    imageRightsWarnings: reviewArtifact?.imageRightsWarnings ?? [],
    contentPolicy: pipeline?.missionContract?.contentPolicy ?? {
      sourcedFieldsApproved: false,
      suggestedFieldsApproved: false,
    },
    actions: reviewArtifact?.actions ?? [
      'confirm_and_create',
      'edit_extracted_data',
      'exclude_source',
      'replace_with_upload',
      'use_suggestions',
      'start_blank',
    ],
    researchDebugger:
      research.researchDebugger && typeof research.researchDebugger === 'object'
        ? research.researchDebugger
        : null,
    draftId: meta.draftId ?? reviewArtifact?.draftId ?? null,
  };
}

/**
 * Emit owner review artifact when research is pending confirmation.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string|null|undefined} missionId
 * @param {string|null|undefined} draftId
 */
export async function maybeEmitPendingStoreResearchReview(prisma, missionId, draftId) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) return;
  const mrow = await prisma.mission
    .findUnique({ where: { id: mid }, select: { context: true } })
    .catch(() => null);
  const ctx = mrow?.context && typeof mrow.context === 'object' ? mrow.context : {};
  const persistedResearch =
    ctx.storeCreationResearch && typeof ctx.storeCreationResearch === 'object'
      ? ctx.storeCreationResearch
      : null;
  if (!persistedResearch || persistedResearch.ownerConfirmed === true) return;
  const hasReviewPayload =
    persistedResearch.ownerReviewRequired ||
    (Array.isArray(persistedResearch.extractedServices) && persistedResearch.extractedServices.length > 0) ||
    (persistedResearch.researchDebugger && typeof persistedResearch.researchDebugger === 'object') ||
    (persistedResearch.storeResearchPipeline &&
      typeof persistedResearch.storeResearchPipeline === 'object');
  if (!hasReviewPayload) return;
  await emitStoreResearchReviewArtifact(
    mid,
    buildStoreResearchReviewArtifactPayload(mid, persistedResearch, { draftId: draftId ?? null }),
  );
}

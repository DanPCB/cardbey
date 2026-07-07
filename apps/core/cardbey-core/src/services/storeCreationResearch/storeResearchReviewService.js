/**
 * Owner review for research-backed store catalog (accept / edit / fallback).
 */

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
    const nextCtx = {
      ...ctx,
      storeCreationResearch: {
        ...research,
        ownerConfirmed: false,
        ownerRejected: true,
        reviewStatus: 'rejected_fallback',
        rejectedAt: new Date().toISOString(),
      },
    };
    await prisma.mission.update({ where: { id: missionId }, data: { context: nextCtx } }).catch(() => {});
    await emitStoreResearchConfirmedArtifact(
      missionId,
      'Using AI-generated catalog instead. Re-run store build to refresh your menu.',
    );
    return { ok: true, action, rejected: true };
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

  const nextCtx = {
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
  };

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
  return {
    ownerReviewRequired: Boolean(research.ownerReviewRequired),
    confidence: typeof research.confidence === 'number' ? research.confidence : null,
    sourcesUsed: Array.isArray(research.sourcesUsed) ? research.sourcesUsed : [],
    sourcesPendingConfirmation: Array.isArray(research.sourcesPendingConfirmation)
      ? research.sourcesPendingConfirmation
      : [],
    extractedServices: Array.isArray(research.extractedServices) ? research.extractedServices : [],
    researchDebugger:
      research.researchDebugger && typeof research.researchDebugger === 'object'
        ? research.researchDebugger
        : null,
    draftId: meta.draftId ?? null,
  };
}

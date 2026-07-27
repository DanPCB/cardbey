/**
 * Phase 8 — Persist research provenance on store draft / mission context.
 */

/** @typedef {import('./types.js').StoreResearchProvenance} StoreResearchProvenance */
/** @typedef {import('./types.js').BusinessEvidence} BusinessEvidence */
/** @typedef {import('./types.js').DiscoveredSource} DiscoveredSource */

/**
 * @param {object} params
 * @returns {StoreResearchProvenance}
 */
export function buildStoreResearchProvenance({ evidence, sources = [], fieldProvenance = {} }) {
  const researchedAt = new Date().toISOString();
  return {
    evidenceId: evidence?.evidenceId ?? null,
    sources,
    fieldProvenance,
    researchedAt,
    ownerConfirmedAt: null,
  };
}

/**
 * @param {Record<string, unknown>} previewOrMeta
 * @param {StoreResearchProvenance} provenance
 */
export function attachResearchProvenanceToPreview(previewOrMeta, provenance) {
  const base = previewOrMeta && typeof previewOrMeta === 'object' ? previewOrMeta : {};
  const meta = base.meta && typeof base.meta === 'object' ? { ...base.meta } : {};
  meta.research = provenance;
  return { ...base, meta };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {object} payload
 */
export async function persistStoreResearchProvenance(prisma, missionId, payload) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !prisma?.mission) return null;

  const row = await prisma.mission.findUnique({ where: { id: mid }, select: { context: true } });
  const ctx = row?.context && typeof row.context === 'object' ? { ...row.context } : {};

  ctx.storeResearchProvenance = payload.provenance ?? null;
  ctx.storeCreationMissionContract = payload.missionContract ?? null;
  ctx.storeResearchReview = payload.reviewArtifact ?? null;

  if (payload.legacyResearchResult) {
    ctx.storeCreationResearch = {
      ...(ctx.storeCreationResearch && typeof ctx.storeCreationResearch === 'object'
        ? ctx.storeCreationResearch
        : {}),
      ...payload.legacyResearchResult,
      ownerReviewRequired: payload.ownerReviewRequired ?? true,
      reviewStatus: 'pending',
    };
  }

  await prisma.mission.update({
    where: { id: mid },
    data: { context: ctx },
  });

  return ctx;
}

/**
 * Mark provenance owner-confirmed.
 * @param {StoreResearchProvenance} provenance
 */
export function markProvenanceOwnerConfirmed(provenance) {
  return {
    ...provenance,
    ownerConfirmedAt: new Date().toISOString(),
  };
}

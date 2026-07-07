/**
 * Persist research evidence on mission context / draft metadata (in-memory fallback).
 */

import { buildResearchDebuggerSnapshot } from './buildResearchDebuggerSnapshot.js';

/** @type {Map<string, import('./types.js').BusinessResearchResult>} */
const memoryStore = new Map();

function cacheKey(input) {
  return [
    input.missionId ?? '',
    input.draftId ?? '',
    input.businessName ?? '',
    input.website ?? '',
  ].join('|');
}

/**
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @param {import('./types.js').BusinessResearchResult} result
 */
export function saveResearchEvidence(input, result) {
  const key = cacheKey(input);
  memoryStore.set(key, result);
  return key;
}

/**
 * @param {import('./types.js').StoreCreationResearchInput} input
 * @returns {import('./types.js').BusinessResearchResult|null}
 */
export function loadResearchEvidence(input) {
  return memoryStore.get(cacheKey(input)) ?? null;
}

/**
 * Attach research payload to mission context for owner review UI.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} missionId
 * @param {import('./types.js').BusinessResearchResult} result
 */
export async function persistResearchToMission(prisma, missionId, result, meta = {}) {
  if (!prisma || !missionId) return;
  const row = await prisma.mission.findUnique({ where: { id: missionId }, select: { context: true } }).catch(() => null);
  const ctx = row?.context && typeof row.context === 'object' ? { ...row.context } : {};
  const draftId =
    typeof meta.draftId === 'string' && meta.draftId.trim()
      ? meta.draftId.trim()
      : typeof result?.draftId === 'string'
        ? result.draftId.trim()
        : null;
  const input = meta.input && typeof meta.input === 'object' ? meta.input : {};
  const serviceItems =
    result.extractedItems ??
    result.catalog?.products ??
    result.facts?.services ??
    result.facts?.menuItems ??
    result.facts?.products ??
    [];
  const researchDebugger = buildResearchDebuggerSnapshot(input, result, {
    scoredSources: meta.scoredSources ?? result.scoredSources ?? [],
  });
  ctx.storeCreationResearch = {
    ownerReviewRequired: result.ownerReviewRequired,
    ownerConfirmed: false,
    reviewStatus: 'pending',
    confidence: result.confidence,
    fallbackToGenerated: result.fallbackToGenerated,
    businessProfile: result.businessProfile ?? null,
    businessKind: result.businessProfile?.businessType ?? null,
    catalogLabel: result.businessProfile?.presentation?.catalogLabel ?? null,
    catalogMode: result.businessProfile?.catalogMode ?? null,
    primaryCTA: result.businessProfile?.presentation?.primaryCTA ?? null,
    sourcesUsed: (result.sourcesUsed ?? []).map((s) => ({
      sourceType: s.source.sourceType,
      sourceUrl: s.source.sourceUrl ?? null,
      confidence: s.confidence,
      reasons: s.reasons,
    })),
    sourcesPendingConfirmation: (result.sourcesPendingConfirmation ?? []).map((s) => ({
      sourceType: s.source.sourceType,
      sourceUrl: s.source.sourceUrl ?? null,
      confidence: s.confidence,
    })),
    extractedServices: summarizeItemsForReview(serviceItems),
    researchDebugger,
    savedAt: new Date().toISOString(),
    draftId,
  };
  if (serviceItems.length && !result.fallbackToGenerated) {
    ctx.preloadedCatalogItems = summarizeItemsForPreload(serviceItems);
  }
  if (draftId) {
    ctx.draftId = ctx.draftId ?? draftId;
    ctx.entities = ctx.entities && typeof ctx.entities === 'object' ? { ...ctx.entities } : {};
    ctx.entities.draftId = ctx.entities.draftId ?? draftId;
  }
  await prisma.mission.update({ where: { id: missionId }, data: { context: ctx } }).catch(() => {});
}

function summarizeItemsForReview(items) {
  return (items ?? []).slice(0, 48).map((item, index) => ({
    id: `svc_${index}`,
    name: item.name,
    price: item.price ?? null,
    durationMinutes: item.durationMinutes ?? null,
    confidence: item.confidence ?? null,
    sourceType: item.sourceType ?? null,
    needsOwnerReview: Boolean(item.needsOwnerReview),
    serviceMode: item.serviceMode ?? null,
    executionAction: item.executionAction ?? null,
  }));
}

function summarizeItemsForPreload(items) {
  return (items ?? []).slice(0, 48).map((item) => ({
    name: item.name ?? item.title,
    price: item.price ?? 0,
    category: item.category ?? 'Services',
    description: item.description ?? '',
    durationMinutes: item.durationMinutes ?? null,
    serviceMode: item.serviceMode ?? null,
    executionAction: item.executionAction ?? null,
  })).filter((row) => typeof row.name === 'string' && String(row.name).trim());
}

export function clearResearchEvidenceForTests() {
  memoryStore.clear();
}

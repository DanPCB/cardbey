/**
 * Persist research evidence on mission context / draft metadata (in-memory fallback).
 */

import { buildResearchDebuggerSnapshot } from './buildResearchDebuggerSnapshot.js';
import { buildResearchEvidenceContext } from '../researchEvidence/researchEvidenceRepository.js';

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
  const evidenceContext =
    result.researchEvidence && typeof result.researchEvidence === 'object'
      ? {
          researchEvidence: {
            schemaVersion: result.researchEvidence.schemaVersion,
            plannedProviders: result.researchEvidence.plannedProviders,
            providerResults: result.researchEvidence.providerResults,
            mergedEvidence: result.researchEvidence.mergedEvidence,
            diagnostics: result.researchEvidence.diagnostics,
          },
          businessKnowledgeGraph: result.researchEvidence.businessKnowledgeGraph,
        }
      : buildResearchEvidenceContext({
          input,
          discoveredSources: meta.discoveredSources ?? [],
          scoredSources: meta.scoredSources ?? result.scoredSources ?? [],
          result,
        });
  const providerLookup = new Map(
    (evidenceContext.researchEvidence?.providerResults ?? []).map((row) => [
      `${row.providerId}|${row.sourceUrl ?? ''}`,
      row,
    ]),
  );
  const resolveProviderSummary = (match) => {
    const sourceUrl = match?.source?.sourceUrl ?? '';
    const byUrl = (evidenceContext.researchEvidence?.providerResults ?? []).find(
      (row) => row.sourceUrl === sourceUrl,
    );
    return (
      providerLookup.get(`${byUrl?.providerId ?? ''}|${sourceUrl}`) ??
      byUrl ??
      null
    );
  };
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
      ...(resolveProviderSummary(s)
        ? {
            providerId: resolveProviderSummary(s).providerId ?? null,
            providerName: resolveProviderSummary(s).providerName ?? null,
            tier: resolveProviderSummary(s).tier ?? null,
            sourceKind: resolveProviderSummary(s).sourceType ?? null,
          }
        : {}),
      sourceType: s.source.sourceType,
      sourceUrl: s.source.sourceUrl ?? null,
      confidence: s.confidence,
      reasons: s.reasons,
      ownerVerifiedStatus: s.confidence >= 0.75 ? 'accepted' : 'pending',
    })),
    sourcesPendingConfirmation: (result.sourcesPendingConfirmation ?? []).map((s) => ({
      ...(resolveProviderSummary(s)
        ? {
            providerId: resolveProviderSummary(s).providerId ?? null,
            providerName: resolveProviderSummary(s).providerName ?? null,
            tier: resolveProviderSummary(s).tier ?? null,
            sourceKind: resolveProviderSummary(s).sourceType ?? null,
          }
        : {}),
      sourceType: s.source.sourceType,
      sourceUrl: s.source.sourceUrl ?? null,
      confidence: s.confidence,
      reasons: s.reasons,
      ownerVerifiedStatus: 'needs_owner_review',
    })),
    extractedServices: summarizeItemsForReview(serviceItems),
    researchDebugger,
    savedAt: new Date().toISOString(),
    draftId,
  };
  ctx.researchEvidence = evidenceContext.researchEvidence;
  ctx.businessKnowledgeGraph = evidenceContext.businessKnowledgeGraph;
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
    providerId: item.providerId ?? null,
    providerName: item.providerName ?? null,
    tier: item.tier ?? null,
    needsOwnerReview: Boolean(item.needsOwnerReview),
    ownerVerifiedStatus: item.ownerVerifiedStatus ?? (item.needsOwnerReview ? 'needs_owner_review' : 'pending'),
    conflict: Boolean(item.conflict),
    conflictingValues: Array.isArray(item.conflictingValues) ? item.conflictingValues : [],
    serviceMode: item.serviceMode ?? null,
    executionAction: item.executionAction ?? null,
    category: item.category ?? null,
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

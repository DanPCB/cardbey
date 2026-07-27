import { buildBusinessKnowledgeGraph } from './businessKnowledgeGraph.js';
import { mergeEvidence } from './evidenceMerger.js';
import { createProviderRegistry } from './providerRegistry.js';
import { selectResearchProviders } from './providerRouter.js';
import { createAiFallbackProviderResult, normalizeLegacyMatchToProviderResult } from './providerResultNormalizer.js';

export function buildResearchEvidenceSnapshot({
  input = {},
  discoveredSources = [],
  scoredSources = [],
  result = {},
} = {}) {
  const registry = createProviderRegistry();
  const plannedProviders = selectResearchProviders(input).map((row) => ({
    ...row,
    available: registry.has(row.id),
  }));
  const providerResults = (scoredSources ?? [])
    .map((match) => normalizeLegacyMatchToProviderResult(match))
    .filter(Boolean);

  if (!providerResults.length || result.fallbackToGenerated) {
    providerResults.push(createAiFallbackProviderResult(input));
  }

  const merged = mergeEvidence(providerResults);
  const businessKnowledgeGraph = buildBusinessKnowledgeGraph({
    providerResults,
    businessProfile: result.businessProfile ?? null,
    catalog: result.catalog ?? null,
  });

  return {
    schemaVersion: 'v1',
    plannedProviders,
    discoveredSourceCount: Array.isArray(discoveredSources) ? discoveredSources.length : 0,
    providerResults,
    mergedEvidence: merged,
    businessKnowledgeGraph,
    diagnostics: {
      selectedProviderIds: plannedProviders.map((row) => row.id ?? row.providerId),
      fallbackUsed: Boolean(result.fallbackToGenerated),
      createdAt: new Date().toISOString(),
    },
  };
}

export function buildResearchEvidenceContext({
  input = {},
  discoveredSources = [],
  scoredSources = [],
  result = {},
} = {}) {
  const snapshot = buildResearchEvidenceSnapshot({ input, discoveredSources, scoredSources, result });
  return {
    researchEvidence: {
      schemaVersion: snapshot.schemaVersion,
      plannedProviders: snapshot.plannedProviders,
      providerResults: snapshot.providerResults,
      mergedEvidence: snapshot.mergedEvidence,
      diagnostics: snapshot.diagnostics,
    },
    businessKnowledgeGraph: snapshot.businessKnowledgeGraph,
  };
}

export function applyOwnerDecisionToEvidence(ctx = {}, action, approvedServices = []) {
  const nextCtx = { ...ctx };
  if (nextCtx.businessKnowledgeGraph && typeof nextCtx.businessKnowledgeGraph === 'object') {
    nextCtx.businessKnowledgeGraph = {
      ...nextCtx.businessKnowledgeGraph,
      ownerVerification: {
        ...(nextCtx.businessKnowledgeGraph.ownerVerification ?? {}),
        status: action === 'accept' ? 'accepted' : 'rejected',
        lastDecisionAt: new Date().toISOString(),
      },
      services: action === 'accept' && approvedServices.length
        ? approvedServices.map((svc, index) => ({
            id: svc.id ?? `svc_${index}`,
            name: svc.name,
            description: null,
            price: svc.price ?? null,
            durationMinutes: svc.durationMinutes ?? null,
            category: svc.category ?? null,
            executionAction: svc.executionAction ?? null,
            serviceMode: svc.serviceMode ?? null,
            meta: {
              sourceEvidenceIds: [],
              confidence: typeof svc.confidence === 'number' ? svc.confidence : 0,
              tier: 4,
              ownerVerifiedStatus: 'accepted',
              lastUpdatedAt: new Date().toISOString(),
            },
          }))
        : nextCtx.businessKnowledgeGraph.services,
    };
  }
  if (nextCtx.researchEvidence && typeof nextCtx.researchEvidence === 'object') {
    nextCtx.researchEvidence = {
      ...nextCtx.researchEvidence,
      diagnostics: {
        ...(nextCtx.researchEvidence.diagnostics ?? {}),
        lastOwnerDecision: action,
        lastOwnerDecisionAt: new Date().toISOString(),
      },
    };
  }
  return nextCtx;
}

import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import { extractResolutionHints } from './extractResolutionHints.js';
import { inferMarketEntityKind, isBusinessResearchApplicable } from './inferMarketEntityKind.js';
import {
  buildResolvedMarketEntity,
  deriveResolutionStatus,
  mapResolverCandidate,
  type BusinessEntityResolverResult,
} from './buildResolvedMarketEntity.js';
import type { ResolvedMarketEntity } from './entityTypes.js';

export type ResolveBusinessEntityFn = (input: {
  businessName: string;
  location?: string | null;
  websiteHint?: string | null;
  phoneHint?: string | null;
}) => Promise<BusinessEntityResolverResult>;

async function defaultResolveBusinessEntity(input: {
  businessName: string;
  location?: string | null;
  websiteHint?: string | null;
  phoneHint?: string | null;
}): Promise<BusinessEntityResolverResult> {
  const { resolveBusinessEntity } = await import('../storeResearch/businessEntityResolver.js');
  const result = await resolveBusinessEntity({
    businessName: input.businessName,
    location: input.location ?? undefined,
    websiteHint: input.websiteHint ?? undefined,
    phoneHint: input.phoneHint ?? undefined,
  });
  return {
    candidates: (result.candidates ?? []).map(mapResolverCandidate),
    selectedCandidate: result.selectedCandidate
      ? mapResolverCandidate(result.selectedCandidate)
      : null,
    confidence: result.confidence ?? 0,
    requiresOwnerConfirmation: result.requiresOwnerConfirmation ?? true,
    resolutionNotes: result.resolutionNotes ?? [],
  };
}

export type ResolveMarketEntityOptions = {
  resolveBusinessEntity?: ResolveBusinessEntityFn;
  skipPlacesLookup?: boolean;
};

/**
 * Canonical G2 entity resolution path for external market signals.
 * Primary: storeResearch/businessEntityResolver.js (Places + hints).
 * NOT used: EntityResolver.ts (ingestion dedupe), BusinessIdentityEngine.ts (candidate ingest).
 */
export async function resolveMarketEntity(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  options: ResolveMarketEntityOptions = {},
): Promise<ResolvedMarketEntity> {
  const hints = extractResolutionHints(signal, analysis);
  const entityKind = inferMarketEntityKind(signal, analysis);

  if (!isBusinessResearchApplicable(entityKind)) {
    const { status, confidence, notes } = deriveResolutionStatus([], hints, entityKind);
    return buildResolvedMarketEntity({
      signalId: signal.signalId,
      entityKind,
      hints,
      resolverResult: null,
      status,
      confidence,
      notes,
    });
  }

  if (analysis.classification !== 'COMMERCIAL') {
    return buildResolvedMarketEntity({
      signalId: signal.signalId,
      entityKind,
      hints,
      resolverResult: null,
      status: 'NOT_APPLICABLE',
      confidence: 0,
      notes: ['G1 classification is not commercial'],
    });
  }

  let resolverResult: BusinessEntityResolverResult | null = null;

  if (!options.skipPlacesLookup && hints.businessName) {
    const resolveFn = options.resolveBusinessEntity ?? defaultResolveBusinessEntity;
    resolverResult = await resolveFn({
      businessName: hints.businessName,
      location: hints.location,
      websiteHint: hints.websiteHint,
      phoneHint: hints.phoneHint,
    });
  }

  const { status, confidence, notes } = deriveResolutionStatus(
    resolverResult?.candidates ?? [],
    hints,
    entityKind,
  );

  return buildResolvedMarketEntity({
    signalId: signal.signalId,
    entityKind,
    hints,
    resolverResult,
    status,
    confidence,
    notes,
  });
}

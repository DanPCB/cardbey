import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { G2Outcome, MarketSignalG2Result } from './entityTypes.js';
import { resolveMarketEntity, type ResolveMarketEntityOptions } from './resolveMarketEntity.js';
import { runMarketEntityResearch, type RunMarketEntityResearchOptions } from './runMarketEntityResearch.js';
import { isBusinessResearchApplicable } from './inferMarketEntityKind.js';
import { shouldProceedToResearch } from './buildResolvedMarketEntity.js';
import { extractResolutionHints } from './extractResolutionHints.js';

export type ProcessMarketSignalG2Options = ResolveMarketEntityOptions &
  RunMarketEntityResearchOptions;

function deriveG2Outcome(params: {
  classification: string;
  entityKind: string;
  resolutionStatus: string;
  researchStatus: string | null;
}): G2Outcome {
  if (params.classification === 'NON_COMMERCIAL') return 'SKIPPED_NON_COMMERCIAL';
  if (params.classification === 'AMBIGUOUS' || params.classification === 'UNKNOWN') {
    return 'SKIPPED_AMBIGUOUS_G1';
  }

  if (!isBusinessResearchApplicable(params.entityKind as 'BUSINESS')) {
    return 'RESEARCH_NOT_APPLICABLE';
  }

  if (params.resolutionStatus === 'AMBIGUOUS') return 'RESOLUTION_AMBIGUOUS';
  if (params.resolutionStatus === 'UNRESOLVED') return 'RESOLUTION_UNRESOLVED';
  if (params.resolutionStatus === 'NOT_APPLICABLE') return 'RESEARCH_NOT_APPLICABLE';

  if (params.researchStatus === 'READY') return 'RESEARCH_READY';
  if (params.researchStatus === 'NOT_APPLICABLE') return 'RESEARCH_NOT_APPLICABLE';
  if (params.researchStatus === 'INSUFFICIENT_EVIDENCE') return 'RESEARCH_INSUFFICIENT_EVIDENCE';
  if (params.researchStatus === 'FAILED') return 'RESEARCH_FAILED';
  if (params.researchStatus === 'SKIPPED') return 'RESEARCH_NOT_APPLICABLE';

  if (
    params.resolutionStatus === 'RESOLVED' ||
    params.resolutionStatus === 'PARTIALLY_RESOLVED'
  ) {
    return 'RESOLUTION_READY';
  }

  return 'RESOLUTION_UNRESOLVED';
}

/**
 * G2 orchestrator: G1 signal + analysis → entity resolution → governed research.
 */
export async function processMarketSignalG2(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  options: ProcessMarketSignalG2Options = {},
): Promise<MarketSignalG2Result> {
  const g1Evidence = [
    ...analysis.classificationEvidence,
    ...analysis.has.flatMap((h) => h.evidence),
    ...analysis.wants.flatMap((w) => w.evidence),
  ];

  if (analysis.classification === 'NON_COMMERCIAL') {
    const resolvedEntity = await resolveMarketEntity(signal, analysis, {
      ...options,
      skipPlacesLookup: true,
    });
    return {
      signalId: signal.signalId,
      resolvedEntity,
      research: null,
      outcome: 'SKIPPED_NON_COMMERCIAL',
      diagnostics: {
        signalId: signal.signalId,
        entityKind: resolvedEntity.entityKind,
        resolutionStatus: resolvedEntity.resolutionStatus,
        researchStatus: null,
        outcome: 'SKIPPED_NON_COMMERCIAL',
      },
      g1Evidence,
    };
  }

  if (analysis.classification === 'AMBIGUOUS' || analysis.classification === 'UNKNOWN') {
    const resolvedEntity = await resolveMarketEntity(signal, analysis, {
      ...options,
      skipPlacesLookup: true,
    });
    return {
      signalId: signal.signalId,
      resolvedEntity,
      research: null,
      outcome: 'SKIPPED_AMBIGUOUS_G1',
      diagnostics: {
        signalId: signal.signalId,
        entityKind: resolvedEntity.entityKind,
        resolutionStatus: resolvedEntity.resolutionStatus,
        researchStatus: null,
        outcome: 'SKIPPED_AMBIGUOUS_G1',
      },
      g1Evidence,
    };
  }

  const resolvedEntity = await resolveMarketEntity(signal, analysis, options);
  resolvedEntity.researchedAt = new Date().toISOString();

  let research = null;
  let failureReason: string | null = null;

  if (shouldProceedToResearch(resolvedEntity.entityKind, resolvedEntity.resolutionStatus)) {
    const hints = extractResolutionHints(signal, analysis);
    research = await runMarketEntityResearch(resolvedEntity, {
      ...options,
      category: hints.category,
    });
    if (research.researchStatus === 'FAILED') {
      failureReason = research.limitations.join('; ');
    }
  }

  const outcome = deriveG2Outcome({
    classification: analysis.classification,
    entityKind: resolvedEntity.entityKind,
    resolutionStatus: resolvedEntity.resolutionStatus,
    researchStatus: research?.researchStatus ?? null,
  });

  return {
    signalId: signal.signalId,
    resolvedEntity,
    research,
    outcome,
    diagnostics: {
      signalId: signal.signalId,
      entityKind: resolvedEntity.entityKind,
      resolutionStatus: resolvedEntity.resolutionStatus,
      researchStatus: research?.researchStatus ?? null,
      outcome,
      failureReason,
    },
    g1Evidence,
  };
}

import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { MarketSignalG2Result } from './entityTypes.js';
import type { MarketSignalG3Result, MissionContext } from './opportunityTypes.js';
import { assessMarketOpportunity, deriveG3Outcome } from './assessMarketOpportunity.js';
import type { ProcessMarketSignalG2Options } from './processMarketSignalG2.js';
import { processMarketSignalG2 } from './processMarketSignalG2.js';

export type ProcessMarketSignalG3Options = ProcessMarketSignalG2Options & {
  missionContext?: MissionContext;
};

/**
 * Full G1→G2→G3 pipeline for a market signal.
 */
export async function processMarketSignalG3FromG1(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  options: ProcessMarketSignalG3Options = {},
): Promise<MarketSignalG3Result & { g2: MarketSignalG2Result }> {
  const g2 = await processMarketSignalG2(signal, analysis, options);
  const g3 = processMarketSignalG3FromG2(signal, analysis, g2, options);
  return { ...g3, g2 };
}

/**
 * G3 assessment from existing G2 result — preserves upstream on failure.
 */
export function processMarketSignalG3FromG2(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  g2: MarketSignalG2Result,
  options: { missionContext?: MissionContext } = {},
): MarketSignalG3Result {
  try {
    const opportunity = assessMarketOpportunity({
      signal,
      analysis,
      resolved: g2.resolvedEntity,
      research: g2.research,
      g1Evidence: g2.g1Evidence,
      missionContext: options.missionContext ?? 'CARDBEY_ACQUISITION',
    });

    const capabilityMatches = [...opportunity.primaryMatches, ...opportunity.supportingMatches];
    const outcome = deriveG3Outcome(opportunity.overallFitBand, opportunity.primaryMatches.length);

    return {
      signalId: signal.signalId,
      opportunity,
      capabilityMatches,
      outcome,
      diagnostics: {
        signalId: signal.signalId,
        overallFitBand: opportunity.overallFitBand,
        overallScore: opportunity.overallScore,
        outcome,
        primaryCapabilityCount: opportunity.primaryMatches.length,
      },
      provenanceChain: {
        g1Evidence: g2.g1Evidence,
        entityEvidence: g2.resolvedEntity.evidence,
        researchEvidence: g2.research?.evidence ?? [],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      signalId: signal.signalId,
      opportunity: {
        signalId: signal.signalId,
        resolvedEntityRef: g2.resolvedEntity.resolvedEntityRef,
        missionContext: options.missionContext ?? 'CARDBEY_ACQUISITION',
        relevanceStatus: 'INSUFFICIENT_EVIDENCE',
        intentStrength: 0,
        evidenceConfidence: 0,
        entityConfidence: 0,
        businessRelevance: 0,
        strategicFit: 0,
        capabilityFit: 0,
        overallFitBand: 'INSUFFICIENT_EVIDENCE',
        overallScore: 0,
        factors: [],
        reasons: [],
        disqualifiers: [message],
        limitations: [],
        primaryMatches: [],
        supportingMatches: [],
        unavailableDesiredCapabilities: [],
        assessmentEvidence: [],
        assessedAt: new Date().toISOString(),
        scorerVersion: 'g3.0.0-failed',
      },
      capabilityMatches: [],
      outcome: 'ASSESSMENT_FAILED',
      diagnostics: {
        signalId: signal.signalId,
        overallFitBand: 'INSUFFICIENT_EVIDENCE',
        overallScore: 0,
        outcome: 'ASSESSMENT_FAILED',
        primaryCapabilityCount: 0,
        failureReason: message,
      },
      provenanceChain: {
        g1Evidence: g2.g1Evidence,
        entityEvidence: g2.resolvedEntity.evidence,
        researchEvidence: g2.research?.evidence ?? [],
      },
    };
  }
}

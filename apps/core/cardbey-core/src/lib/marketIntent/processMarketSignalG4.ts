import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { MarketSignalG3Result } from './opportunityTypes.js';
import type { MarketSignalG4Result, G4Outcome } from './briefTypes.js';
import { composeOpportunityBrief } from './composeOpportunityBrief.js';
import { assembleCardbeySolution } from './assembleCardbeySolution.js';
import { prepareSolutionPreviews } from './prepareSolutionPreviews.js';
import { determinePreparationLevel } from './determinePreparationLevel.js';
import type { ProcessMarketSignalG3Options } from './processMarketSignalG3.js';
import { processMarketSignalG3FromG2 } from './processMarketSignalG3.js';
import { processMarketSignalG2 } from './processMarketSignalG2.js';
import type { MarketSignalG2Result } from './entityTypes.js';

export type ProcessMarketSignalG4Options = ProcessMarketSignalG3Options;

function deriveG4Outcome(
  briefStatus: G4Outcome,
  solutionStatus: G4Outcome | null,
  previewCount: number,
): G4Outcome {
  if (previewCount > 0) return 'PREVIEW_READY';
  if (solutionStatus === 'SOLUTION_READY' || solutionStatus === 'CAPABILITY_UNAVAILABLE') {
    return solutionStatus;
  }
  return briefStatus;
}

/**
 * G4 from existing G3 result — preserves upstream on failure.
 */
export function processMarketSignalG4FromG3(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  g2: MarketSignalG2Result,
  g3: MarketSignalG3Result,
  options: { missionContext?: ProcessMarketSignalG4Options['missionContext'] } = {},
): MarketSignalG4Result {
  try {
    const preparationLevel = determinePreparationLevel({
      fitBand: g3.opportunity.overallFitBand,
      g3Outcome: g3.outcome,
      analysis,
      resolved: g2.resolvedEntity,
      primaryCapabilityCount: g3.opportunity.primaryMatches.length,
    });

    let solution = assembleCardbeySolution({
      signalId: signal.signalId,
      analysis,
      opportunity: g3.opportunity,
      capabilityMatches: g3.capabilityMatches,
      preparationLevel,
      researchObjectiveType: g3.researchObjective?.objectiveType ?? null,
      coreNeedServiceability: g3.opportunity.coreNeed?.serviceability ?? null,
    });

    const brief = composeOpportunityBrief({
      signal,
      analysis,
      resolved: g2.resolvedEntity,
      research: g2.research,
      opportunity: g3.opportunity,
      capabilityMatches: g3.capabilityMatches,
      preparationLevel,
      marketOpportunityResearch: g3.marketOpportunityResearch,
      recommendedSolutionSummary: solution
        ? `Sequence: ${solution.sequence.join(' → ')}`
        : undefined,
    });

    let previews = solution
      ? prepareSolutionPreviews({
          solution,
          analysis,
          resolved: g2.resolvedEntity,
          research: g2.research,
          fitBand: g3.opportunity.overallFitBand,
          preparationLevel,
          marketOpportunityResearch: g3.marketOpportunityResearch,
        })
      : [];

    if (solution && previews.length) {
      solution = { ...solution, previews, solutionStatus: 'PREVIEW_READY' };
    }

    const outcome = deriveG4Outcome(brief.briefStatus, solution?.solutionStatus ?? null, previews.length);

    return {
      signalId: signal.signalId,
      brief,
      solution,
      outcome,
      preparationLevel,
      diagnostics: {
        signalId: signal.signalId,
        outcome,
        preparationLevel,
        componentCount: solution?.components.length ?? 0,
        previewCount: previews.length,
      },
      provenanceChain: {
        g1EvidenceCount: g3.provenanceChain.g1Evidence.length,
        entityEvidenceCount: g3.provenanceChain.entityEvidence.length,
        researchEvidenceCount: g3.provenanceChain.researchEvidence.length,
        g3FactorCount: g3.opportunity.factors.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      signalId: signal.signalId,
      brief: {
        signalId: signal.signalId,
        resolvedEntityRef: g2.resolvedEntity.resolvedEntityRef,
        assessmentRef: g3.opportunity.scorerVersion,
        summary: 'G4 assembly failed',
        sections: {
          situation: [],
          intent: [],
          business: [],
          opportunity: [],
          gaps: [],
          cardbeyFit: [],
          proposedSolution: [],
          limitations: [{ statement: message, basis: 'FACT', source: 'g4' }],
          nextAction: [],
        },
        evidence: [],
        knownFacts: [],
        inferences: [],
        unknowns: [],
        businessContext: {},
        opportunity: '',
        gaps: [],
        constraints: [message],
        cardbeyFitSummary: '',
        matchedCapabilities: [],
        recommendedSolutionSummary: '',
        confidence: 0,
        limitations: [message],
        opportunityCard: {
          title: 'Assembly failed',
          fitBand: g3.opportunity.overallFitBand,
          fitLabel: 'failed',
          intentSummary: '',
          foundSummary: '',
          relevanceSummary: '',
          canPrepare: [],
          currentLimitations: [message],
          nextActionLabel: 'Review failure',
        },
        preparationLevel: 0,
        briefStatus: 'ASSEMBLY_FAILED',
        composedAt: new Date().toISOString(),
        composerVersion: 'g4.0.0-failed',
      },
      solution: null,
      outcome: 'ASSEMBLY_FAILED',
      preparationLevel: 0,
      diagnostics: {
        signalId: signal.signalId,
        outcome: 'ASSEMBLY_FAILED',
        preparationLevel: 0,
        componentCount: 0,
        previewCount: 0,
        failureReason: message,
      },
      provenanceChain: {
        g1EvidenceCount: g3.provenanceChain.g1Evidence.length,
        entityEvidenceCount: g3.provenanceChain.entityEvidence.length,
        researchEvidenceCount: g3.provenanceChain.researchEvidence.length,
        g3FactorCount: g3.opportunity.factors.length,
      },
    };
  }
}

export function processMarketSignalG4FromG2(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  g2: MarketSignalG2Result,
  options: ProcessMarketSignalG4Options = {},
): MarketSignalG4Result {
  const g3 = processMarketSignalG3FromG2(signal, analysis, g2, options);
  return processMarketSignalG4FromG3(signal, analysis, g2, g3, options);
}

/**
 * Full G1→G2→G3→G4 pipeline.
 */
export async function processMarketSignalG4FromG1(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  options: ProcessMarketSignalG4Options = {},
): Promise<MarketSignalG4Result & { g2: MarketSignalG2Result; g3: MarketSignalG3Result }> {
  const g2 = await processMarketSignalG2(signal, analysis, options);
  const g3 = processMarketSignalG3FromG2(signal, analysis, g2, options);
  const g4 = processMarketSignalG4FromG3(signal, analysis, g2, g3, options);
  return { ...g4, g2, g3 };
}

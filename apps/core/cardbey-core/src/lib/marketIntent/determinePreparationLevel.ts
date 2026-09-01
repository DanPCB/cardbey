import type { FitBand } from './opportunityTypes.js';
import type { MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity } from './entityTypes.js';
import type { PreparationLevel } from './briefTypes.js';

export const G4_COMPOSER_VERSION = 'g4.0.0-composition';

export function determinePreparationLevel(params: {
  fitBand: FitBand;
  g3Outcome: string;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  primaryCapabilityCount: number;
}): PreparationLevel {
  const { fitBand, g3Outcome, analysis, resolved, primaryCapabilityCount } = params;

  if (analysis.classification === 'NON_COMMERCIAL' || fitBand === 'NOT_APPLICABLE') {
    return 0;
  }

  if (
    fitBand === 'NOT_A_CARDBEY_OPPORTUNITY' ||
    g3Outcome === 'NOT_A_CARDBEY_OPPORTUNITY' ||
    g3Outcome === 'NO_RELEVANT_CAPABILITY'
  ) {
    return 1;
  }

  if (fitBand === 'INSUFFICIENT_EVIDENCE' || g3Outcome === 'INSUFFICIENT_EVIDENCE') {
    return resolved.resolutionStatus === 'AMBIGUOUS' ? 0 : 1;
  }

  if (fitBand === 'LOW_FIT') {
    return 1;
  }

  if (fitBand === 'MEDIUM_FIT') {
    return primaryCapabilityCount > 0 ? 2 : 1;
  }

  if (fitBand === 'HIGH_FIT') {
    return primaryCapabilityCount >= 2 ? 3 : 2;
  }

  return 1;
}

export function isPreviewEligible(level: PreparationLevel, fitBand: FitBand): boolean {
  return level >= 3 && fitBand === 'HIGH_FIT';
}

export function isSolutionAssemblyEligible(level: PreparationLevel): boolean {
  return level >= 2;
}

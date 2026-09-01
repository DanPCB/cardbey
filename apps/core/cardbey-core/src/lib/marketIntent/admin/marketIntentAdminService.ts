/**
 * Admin test surface — canonical G1→G4 orchestration with partial-stage preservation.
 */
import { ingestMarketSignal } from '../ingestMarketSignal.js';
import { processMarketSignalG2 } from '../processMarketSignalG2.js';
import { processMarketSignalG3FromG2 } from '../processMarketSignalG3.js';
import { processMarketSignalG4FromG3 } from '../processMarketSignalG4.js';
import type { ExternalMarketSignal, MarketIntentAnalysis, MarketSignalSourceType } from '../types.js';
import type { MarketSignalG2Result } from '../entityTypes.js';
import type { MarketSignalG3Result } from '../opportunityTypes.js';
import type { MarketSignalG4Result } from '../briefTypes.js';
import type { LlmGenerateFn } from '../extractMarketIntentWithLlm.js';
import type { ProcessMarketSignalG2Options } from '../processMarketSignalG2.js';
import { MARKET_INTENT_ADMIN_MAX_RAW_TEXT } from './marketIntentAdminConfig.js';
import {
  getMarketIntentSemanticHealth,
  type MarketIntentSemanticHealth,
} from '../resolveMarketIntentSemanticRuntime.js';

export type AdminSourceType =
  | 'social_post'
  | 'website'
  | 'community_post'
  | 'manual_note'
  | 'other';

export type StageStatus = 'ok' | 'failed' | 'skipped' | 'pending';

export class MarketIntentAdminError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MarketIntentAdminError';
    this.code = code;
  }
}

export function mapAdminSourceType(sourceType: AdminSourceType | string): MarketSignalSourceType {
  const map: Record<string, MarketSignalSourceType> = {
    social_post: 'social_post_copy',
    website: 'website_snippet',
    community_post: 'community_post',
    manual_note: 'manual_entry',
    other: 'manual_entry',
  };
  return map[sourceType] ?? 'manual_entry';
}

export type MarketIntentAdminAnalyzeInput = {
  rawText: string;
  sourceType: AdminSourceType | string;
  sourceUrl?: string | null;
  sourceRef?: string | null;
  permitted: boolean;
  skipNetwork?: boolean;
  /** When true, skips Google Places entity lookup (research network may still be constrained separately). */
  skipPlacesLookup?: boolean;
  forceRuleAssisted?: boolean;
  llmGenerate?: LlmGenerateFn;
  abortSignal?: AbortSignal | null;
};

export type MarketIntentStageTimingsMs = {
  g1?: number;
  g2?: number;
  g3?: number;
  g4?: number;
  total?: number;
};

export type MarketIntentAdminAnalyzeResult = {
  ok: boolean;
  status: 'READY' | 'DEGRADED' | 'PARTIAL' | 'FAILED';
  semanticHealth?: MarketIntentSemanticHealth;
  semanticStatus?: MarketIntentSemanticHealth['semanticStatus'];
  stageStatus: {
    g1: StageStatus;
    g2: StageStatus;
    g3: StageStatus;
    g4: StageStatus;
  };
  signal: ExternalMarketSignal | null;
  analysis: MarketIntentAnalysis | null;
  resolvedEntity: MarketSignalG2Result['resolvedEntity'] | null;
  research: MarketSignalG2Result['research'] | null;
  g2Outcome: MarketSignalG2Result['outcome'] | null;
  opportunityAssessment: MarketSignalG3Result['opportunity'] | null;
  capabilityMatches: MarketSignalG3Result['capabilityMatches'] | null;
  researchObjective: MarketSignalG3Result['researchObjective'] | null;
  geography: MarketSignalG3Result['geography'] | null;
  marketOpportunityResearch: MarketSignalG3Result['marketOpportunityResearch'] | null;
  brief: MarketSignalG4Result['brief'] | null;
  solution: MarketSignalG4Result['solution'] | null;
  preparationLevel: MarketSignalG4Result['preparationLevel'] | null;
  previews: MarketSignalG4Result['solution'] extends { previews: infer P } ? P : unknown[] | null;
  g2Diagnostics?: MarketSignalG2Result['diagnostics'];
  error?: string;
  message?: string;
  timingsMs?: MarketIntentStageTimingsMs;
};

function buildResult(
  partial: Omit<MarketIntentAdminAnalyzeResult, 'ok'> & { ok?: boolean },
): MarketIntentAdminAnalyzeResult {
  return { ok: partial.status !== 'FAILED', ...partial };
}

export function buildMarketIntentAdminPipelineOptions(
  input: MarketIntentAdminAnalyzeInput,
): ProcessMarketSignalG2Options {
  return pipelineOptions(input);
}

function pipelineOptions(input: MarketIntentAdminAnalyzeInput): ProcessMarketSignalG2Options {
  const skipNetwork = input.skipNetwork ?? true;
  return {
    skipNetwork,
    // Places resolution is independent of research network constraints in admin test UI.
    skipPlacesLookup: input.skipPlacesLookup ?? false,
    forceRuleAssisted: input.forceRuleAssisted,
    llmGenerate: input.llmGenerate,
    missionContext: 'CARDBEY_ACQUISITION',
  };
}

function assertNotAborted(signal: AbortSignal | null | undefined, stage: string): void {
  if (signal?.aborted) {
    throw new MarketIntentAdminError(`Analysis aborted during ${stage}`, 'request_aborted');
  }
}

function elapsedMs(start: number): number {
  return Date.now() - start;
}

function isSemanticRuntimeDegraded(analysis: MarketIntentAnalysis | null): boolean {
  return (
    analysis?.outcome === 'SEMANTIC_RUNTIME_DEGRADED' ||
    analysis?.diagnostics?.method === 'semantic_runtime_degraded'
  );
}

export function getMarketIntentAdminSemanticHealth(): MarketIntentSemanticHealth {
  return getMarketIntentSemanticHealth();
}

export async function analyzeMarketIntentForAdmin(
  input: MarketIntentAdminAnalyzeInput,
): Promise<MarketIntentAdminAnalyzeResult> {
  if (!input.permitted) {
    throw new MarketIntentAdminError(
      'Public or permitted signal confirmation is required',
      'permission_required',
    );
  }

  const rawText = String(input.rawText ?? '').trim();
  if (!rawText) {
    throw new MarketIntentAdminError('rawText is required', 'invalid_input');
  }
  if (rawText.length > MARKET_INTENT_ADMIN_MAX_RAW_TEXT) {
    throw new MarketIntentAdminError(
      `rawText exceeds ${MARKET_INTENT_ADMIN_MAX_RAW_TEXT} characters`,
      'invalid_input',
    );
  }

  const stageStatus: MarketIntentAdminAnalyzeResult['stageStatus'] = {
    g1: 'pending',
    g2: 'pending',
    g3: 'pending',
    g4: 'pending',
  };

  let signal: ExternalMarketSignal | null = null;
  let analysis: MarketIntentAnalysis | null = null;
  let g2: MarketSignalG2Result | null = null;
  let g3: MarketSignalG3Result | null = null;
  let g4: MarketSignalG4Result | null = null;

  const options = pipelineOptions(input);
  const timingsMs: MarketIntentStageTimingsMs = {};
  const totalStart = Date.now();

  try {
    assertNotAborted(input.abortSignal, 'g1');
    const g1Start = Date.now();
    const g1 = await ingestMarketSignal(
      {
        rawText,
        sourceType: mapAdminSourceType(input.sourceType),
        sourceUrl: input.sourceUrl ?? null,
        sourceRef: input.sourceRef ?? null,
        provenance: {
          permissionBasis: 'manual_operator_confirmed',
          ingestChannel: 'market_intent_admin_test',
        },
      },
      {
        forceRuleAssisted: input.forceRuleAssisted,
        llmGenerate: input.llmGenerate,
      },
    );
    signal = g1.signal;
    analysis = g1.analysis;
    stageStatus.g1 = 'ok';
    timingsMs.g1 = elapsedMs(g1Start);
  } catch (error) {
    if (error instanceof MarketIntentAdminError && error.code === 'request_aborted') {
      throw error;
    }
    stageStatus.g1 = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    return buildResult({
      status: 'FAILED',
      stageStatus,
      signal: null,
      analysis: null,
      resolvedEntity: null,
      research: null,
      g2Outcome: null,
      opportunityAssessment: null,
      capabilityMatches: null,
      brief: null,
      solution: null,
      preparationLevel: null,
      previews: null,
      error: 'g1_failed',
      message: message || 'Could not classify this signal.',
      timingsMs: { ...timingsMs, total: elapsedMs(totalStart) },
    });
  }

  try {
    assertNotAborted(input.abortSignal, 'g2');
    const g2Start = Date.now();
    g2 = await processMarketSignalG2(signal, analysis, options);
    stageStatus.g2 = 'ok';
    timingsMs.g2 = elapsedMs(g2Start);
  } catch (error) {
    if (error instanceof MarketIntentAdminError && error.code === 'request_aborted') {
      throw error;
    }
    stageStatus.g2 = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    return buildResult({
      status: 'PARTIAL',
      stageStatus,
      signal,
      analysis,
      resolvedEntity: null,
      research: null,
      g2Outcome: null,
      opportunityAssessment: null,
      capabilityMatches: null,
      brief: null,
      solution: null,
      preparationLevel: null,
      previews: null,
      error: 'g2_failed',
      message: message || 'Business identity resolution failed.',
      timingsMs: { ...timingsMs, total: elapsedMs(totalStart) },
    });
  }

  try {
    assertNotAborted(input.abortSignal, 'g3');
    const g3Start = Date.now();
    g3 = processMarketSignalG3FromG2(signal, analysis, g2, options);
    stageStatus.g3 = 'ok';
    timingsMs.g3 = elapsedMs(g3Start);
  } catch (error) {
    if (error instanceof MarketIntentAdminError && error.code === 'request_aborted') {
      throw error;
    }
    stageStatus.g3 = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    return buildResult({
      status: 'PARTIAL',
      stageStatus,
      signal,
      analysis,
      resolvedEntity: g2.resolvedEntity,
      research: g2.research,
      g2Outcome: g2.outcome,
      opportunityAssessment: null,
      capabilityMatches: null,
      brief: null,
      solution: null,
      preparationLevel: null,
      previews: null,
      error: 'g3_failed',
      message: message || 'Capability assessment failed.',
      timingsMs: { ...timingsMs, total: elapsedMs(totalStart) },
    });
  }

  try {
    assertNotAborted(input.abortSignal, 'g4');
    const g4Start = Date.now();
    g4 = processMarketSignalG4FromG3(signal, analysis, g2, g3, options);
    stageStatus.g4 = 'ok';
    timingsMs.g4 = elapsedMs(g4Start);
  } catch (error) {
    if (error instanceof MarketIntentAdminError && error.code === 'request_aborted') {
      throw error;
    }
    stageStatus.g4 = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    return buildResult({
      status: 'PARTIAL',
      stageStatus,
      signal,
      analysis,
      resolvedEntity: g2.resolvedEntity,
      research: g2.research,
      g2Outcome: g2.outcome,
      opportunityAssessment: g3.opportunity,
      capabilityMatches: g3.capabilityMatches,
      brief: null,
      solution: null,
      preparationLevel: null,
      previews: null,
      error: 'g4_failed',
      message: message || 'Solution preparation failed.',
      timingsMs: { ...timingsMs, total: elapsedMs(totalStart) },
    });
  }

  timingsMs.total = elapsedMs(totalStart);

  const semanticHealth = getMarketIntentSemanticHealth();
  const degraded = isSemanticRuntimeDegraded(analysis);

  return buildResult({
    status: degraded ? 'DEGRADED' : 'READY',
    semanticHealth,
    semanticStatus: degraded ? 'FAILED' : semanticHealth.semanticStatus,
    stageStatus,
    signal,
    analysis,
    resolvedEntity: g2.resolvedEntity,
    research: g2.research,
    g2Outcome: g2.outcome,
    opportunityAssessment: g3.opportunity,
    capabilityMatches: g3.capabilityMatches,
    researchObjective: g3.researchObjective,
    geography: g3.geography,
    marketOpportunityResearch: g3.marketOpportunityResearch,
    brief: g4.brief,
    solution: g4.solution,
    preparationLevel: g4.preparationLevel,
    previews: g4.solution?.previews ?? [],
    g2Diagnostics: g2.diagnostics,
    timingsMs,
  });
}

import type {
  CommercialClassification,
  EvidenceStatement,
  ExternalMarketSignal,
  HasWantsItem,
  IntentItem,
  MarketIntentAnalysis,
  MarketIntentFamily,
  MarketIntentSemanticFailureCode,
  ProcessingOutcome,
} from './types.js';
import { MARKET_INTENT_ANALYZER_VERSION } from './constants.js';
import type { MarketIntentLlmResponse } from './marketIntentSchema.js';
import { deriveMarketRepresentation } from './deriveMarketRepresentation.js';

export function buildMarketIntentDiagnostics(
  analysis: Pick<
    MarketIntentAnalysis,
    | 'signalId'
    | 'classification'
    | 'classificationConfidence'
    | 'intents'
    | 'outcome'
    | 'diagnostics'
  >,
) {
  return {
    signalId: analysis.signalId,
    classification: analysis.classification,
    primaryIntent: analysis.intents.primary,
    classificationConfidence: analysis.classificationConfidence,
    outcome: analysis.outcome,
    method: analysis.diagnostics.method,
    failureReason: analysis.diagnostics.failureReason ?? null,
  };
}

function sortIntents(items: IntentItem[]): IntentItem[] {
  return [...items].sort((a, b) => b.confidence - a.confidence);
}

function outcomeFromClassification(
  classification: CommercialClassification,
  confidence: number,
): ProcessingOutcome {
  if (classification === 'UNKNOWN') return 'SEMANTIC_RUNTIME_DEGRADED';
  if (classification === 'NON_COMMERCIAL') return 'NON_COMMERCIAL';
  if (classification === 'AMBIGUOUS' || confidence < 0.35) return 'AMBIGUOUS';
  return 'READY';
}

export function buildSemanticDegradedAnalysis(
  signal: ExternalMarketSignal,
  code: MarketIntentSemanticFailureCode,
  reason: string,
): MarketIntentAnalysis {
  const classificationReason =
    code === 'LLM_PROVIDER_NOT_CONFIGURED'
      ? 'Semantic classification requires a configured LLM provider.'
      : `Semantic extraction failed (${code.replace(/_/g, ' ').toLowerCase()}).`;

  return {
    signalId: signal.signalId,
    fingerprint: signal.fingerprint,
    classification: 'UNKNOWN',
    classificationConfidence: 0,
    classificationReason,
    classificationEvidence: [
      {
        statement: reason,
        span: null,
        basis: 'INFERRED',
        confidence: 0,
      },
    ],
    intents: { primary: null, secondary: [], items: [] },
    has: [],
    wants: [],
    actorHint: signal.actorHint ?? null,
    businessHint: null,
    locationHint: signal.locationHint ?? null,
    marketRepresentation: null,
    outcome: 'SEMANTIC_RUNTIME_DEGRADED',
    analyzedAt: new Date().toISOString(),
    analyzerVersion: MARKET_INTENT_ANALYZER_VERSION,
    diagnostics: {
      signalId: signal.signalId,
      classification: 'UNKNOWN',
      primaryIntent: null,
      classificationConfidence: 0,
      outcome: 'SEMANTIC_RUNTIME_DEGRADED',
      method: 'semantic_runtime_degraded',
      failureReason: reason,
      semanticStatus: 'FAILED',
      semanticFailureCode: code,
    },
  };
}

export function buildMarketIntentAnalysis(
  signal: ExternalMarketSignal,
  extracted: MarketIntentLlmResponse,
  method: 'llm' | 'rule_assisted_fallback',
  failureReason?: string | null,
): MarketIntentAnalysis {
  const sorted = sortIntents(
    extracted.intents.map((item) => ({
      family: item.family,
      confidence: item.confidence,
      basis: item.basis,
      evidence: item.evidence as EvidenceStatement[],
    })),
  );

  const primary = sorted[0]?.family ?? null;
  const secondary = sorted.slice(1).map((item) => item.family);

  const outcome =
    method === 'rule_assisted_fallback' && extracted.classification === 'AMBIGUOUS'
      ? 'CLASSIFICATION_FAILED'
      : outcomeFromClassification(extracted.classification, extracted.classificationConfidence);

  const base = {
    signalId: signal.signalId,
    fingerprint: signal.fingerprint,
    classification: extracted.classification,
    classificationConfidence: extracted.classificationConfidence,
    classificationReason: extracted.classificationReason,
    classificationEvidence: extracted.classificationEvidence as EvidenceStatement[],
    intents: {
      primary,
      secondary,
      items: sorted,
    },
    has: extracted.has as HasWantsItem[],
    wants: extracted.wants as HasWantsItem[],
    actorHint: extracted.actorHint ?? signal.actorHint ?? null,
    businessHint: extracted.businessHint ?? null,
    locationHint: extracted.locationHint ?? signal.locationHint ?? null,
    outcome,
    analyzedAt: new Date().toISOString(),
    analyzerVersion: MARKET_INTENT_ANALYZER_VERSION,
    diagnostics: {
      signalId: signal.signalId,
      classification: extracted.classification,
      primaryIntent: primary,
      classificationConfidence: extracted.classificationConfidence,
      outcome,
      method,
      failureReason: failureReason ?? null,
      semanticStatus: method === 'llm' ? 'AVAILABLE' : undefined,
    },
  } satisfies Omit<MarketIntentAnalysis, 'marketRepresentation'>;

  const marketRepresentation = deriveMarketRepresentation({
    analysis: base,
    rawText: signal.rawText,
    llmExtract: extracted,
  });

  return { ...base, marketRepresentation };
}

export function buildFailedAnalysis(
  signal: ExternalMarketSignal,
  reason: string,
): MarketIntentAnalysis {
  return {
    signalId: signal.signalId,
    fingerprint: signal.fingerprint,
    classification: 'AMBIGUOUS',
    classificationConfidence: 0,
    classificationReason: reason,
    classificationEvidence: [],
    intents: { primary: null, secondary: [], items: [] },
    has: [],
    wants: [],
    actorHint: signal.actorHint ?? null,
    businessHint: null,
    locationHint: signal.locationHint ?? null,
    marketRepresentation: null,
    outcome: 'CLASSIFICATION_FAILED',
    analyzedAt: new Date().toISOString(),
    analyzerVersion: MARKET_INTENT_ANALYZER_VERSION,
    diagnostics: {
      signalId: signal.signalId,
      classification: 'AMBIGUOUS',
      primaryIntent: null,
      classificationConfidence: 0,
      outcome: 'CLASSIFICATION_FAILED',
      method: 'rule_assisted_fallback',
      failureReason: reason,
    },
  };
}

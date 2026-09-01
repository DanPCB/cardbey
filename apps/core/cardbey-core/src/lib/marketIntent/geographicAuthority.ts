import { cleanString } from '../businessDiscovery/businessDataNormalizer.runtime.js';
import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity } from './entityTypes.js';
import type { KnowledgeBasis } from './entityTypes.js';

export type GeographicAuthorityKind =
  | 'OBSERVED_GEOGRAPHY'
  | 'RESOLVED_ENTITY_GEOGRAPHY'
  | 'SERVICE_AREA'
  | 'EXPLICIT_TARGET_GEOGRAPHY'
  | 'RESEARCH_SCOPE'
  | 'OPPORTUNITY_GEOGRAPHY'
  | 'OPERATOR_OVERRIDE';

export type GeographicReference = {
  label: string;
  kind: GeographicAuthorityKind;
  source: string;
  basis: KnowledgeBasis;
  confidence: number;
};

export type GeographicAuthority = {
  observedGeography: GeographicReference[];
  resolvedEntityGeography: GeographicReference[];
  explicitTargetGeography: GeographicReference[];
  researchScope: GeographicReference[];
  businessOrigin: GeographicReference[];
};

const NATIONWIDE_PATTERNS =
  /\b(nationwide|toàn quốc|countrywide|across vietnam|vietnam nationwide|all provinces)\b/i;
const GLOBAL_PATTERNS = /\b(global|worldwide|international|quốc tế)\b/i;

function ref(
  label: string,
  kind: GeographicAuthorityKind,
  source: string,
  basis: KnowledgeBasis,
  confidence: number,
): GeographicReference {
  return { label: cleanString(label) ?? label, kind, source, basis, confidence };
}

function extractTargetGeographyFromWants(analysis: MarketIntentAnalysis): GeographicReference[] {
  const out: GeographicReference[] = [];
  for (const want of analysis.wants) {
    const label = want.label ?? '';
    if (NATIONWIDE_PATTERNS.test(label)) {
      out.push(ref('Vietnam — nationwide', 'EXPLICIT_TARGET_GEOGRAPHY', 'g1_wants', want.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE', want.confidence));
    } else if (GLOBAL_PATTERNS.test(label)) {
      out.push(ref('Global discovery', 'EXPLICIT_TARGET_GEOGRAPHY', 'g1_wants', want.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE', want.confidence));
    } else if (/\baustralia\b/i.test(label)) {
      out.push(ref('Australia', 'EXPLICIT_TARGET_GEOGRAPHY', 'g1_wants', want.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE', want.confidence));
    }
  }
  return out;
}

export function buildGeographicAuthority(params: {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  operatorResearchMarket?: string | null;
}): GeographicAuthority {
  const observed: GeographicReference[] = [];
  const resolvedEntity: GeographicReference[] = [];
  const explicitTarget: GeographicReference[] = extractTargetGeographyFromWants(params.analysis);
  const businessOrigin: GeographicReference[] = [];

  const locationHint = cleanString(params.analysis.locationHint);
  if (locationHint) {
    observed.push(ref(locationHint, 'OBSERVED_GEOGRAPHY', 'g1_location_hint', 'FACT', 0.85));
    businessOrigin.push(ref(locationHint, 'OBSERVED_GEOGRAPHY', 'g1_location_hint', 'FACT', 0.85));
  }

  for (const has of params.analysis.has) {
    if (has.type === 'LOCATION' && has.label) {
      observed.push(ref(has.label, 'OBSERVED_GEOGRAPHY', 'g1_has', has.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE', has.confidence));
      if (!businessOrigin.length) {
        businessOrigin.push(ref(has.label, 'OBSERVED_GEOGRAPHY', 'g1_has', has.basis === 'EXPLICIT' ? 'FACT' : 'INFERENCE', has.confidence));
      }
    }
  }

  if (
    params.resolved.resolutionStatus === 'RESOLVED' ||
    params.resolved.resolutionStatus === 'PARTIALLY_RESOLVED'
  ) {
    if (params.resolved.location) {
      resolvedEntity.push(
        ref(params.resolved.location, 'RESOLVED_ENTITY_GEOGRAPHY', 'g2_entity', 'FACT', params.resolved.confidence),
      );
    }
  }

  if (NATIONWIDE_PATTERNS.test(params.signal.rawText ?? '')) {
    explicitTarget.push(ref('Vietnam — nationwide', 'EXPLICIT_TARGET_GEOGRAPHY', 'signal_text', 'FACT', 0.9));
  }

  const researchScope: GeographicReference[] = [];
  const scopeLabel =
    cleanString(params.operatorResearchMarket) ??
    explicitTarget[0]?.label ??
    observed[0]?.label ??
    resolvedEntity[0]?.label ??
    null;

  if (scopeLabel) {
    researchScope.push(ref(scopeLabel, 'RESEARCH_SCOPE', 'derived_scope', 'INFERENCE', 0.75));
  }

  return {
    observedGeography: observed,
    resolvedEntityGeography: resolvedEntity,
    explicitTargetGeography: explicitTarget,
    researchScope,
    businessOrigin,
  };
}

export function formatResearchGeographyLabel(authority: GeographicAuthority): string {
  if (authority.explicitTargetGeography.length) {
    return authority.explicitTargetGeography.map((g) => g.label).join(' · ');
  }
  if (authority.researchScope.length) {
    return authority.researchScope[0].label;
  }
  if (authority.observedGeography.length) {
    return authority.observedGeography[0].label;
  }
  return 'Geography not established';
}

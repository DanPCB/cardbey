/**
 * Market graph node — projection from MarketIntentAnalysis for reciprocal matching.
 */
import type { MarketIntentAnalysis, MarketActorRole, MarketSide } from './types.js';
import type { GeographicAuthority } from './geographicAuthority.js';

/** Contextual supply/demand role — derived from HAS/WANTS, not a permanent entity type. */
export type ContextualMarketRole = 'SUPPLY' | 'DEMAND' | 'DUAL' | 'UNKNOWN';

export type MarketGraphNode = {
  nodeId: string;
  label: string;
  signalId: string;
  classification: MarketIntentAnalysis['classification'];
  primaryIntent: MarketIntentAnalysis['intents']['primary'];
  actorRole: MarketActorRole;
  marketSide: MarketSide;
  /** Derived contextual role for Launchpad Supply/Demand projections. */
  contextualRole: ContextualMarketRole;
  has: MarketIntentAnalysis['has'];
  wants: MarketIntentAnalysis['wants'];
  geographyLabels: string[];
  constraints: string[];
  preferences: string[];
  evidenceConfidence: 'STRONG' | 'MODERATE' | 'WEAK';
  /** Operator-facing context summary from G1 representation (not raw architecture). */
  contextSummary?: string;
};

export function deriveContextualRole(
  node: Pick<MarketGraphNode, 'marketSide' | 'has' | 'wants'>,
): ContextualMarketRole {
  const hasItems = node.has.length > 0;
  const wantItems = node.wants.length > 0;
  if (node.marketSide === 'DUAL_SIDED' || (hasItems && wantItems)) return 'DUAL';
  if (node.marketSide === 'SUPPLY' || (hasItems && !wantItems)) return 'SUPPLY';
  if (node.marketSide === 'DEMAND' || (wantItems && !hasItems)) return 'DEMAND';
  return 'UNKNOWN';
}

export function projectMarketGraphNode(params: {
  nodeId: string;
  label: string;
  analysis: MarketIntentAnalysis;
  geography?: GeographicAuthority | null;
}): MarketGraphNode {
  const { analysis, geography } = params;
  const rep = analysis.marketRepresentation;

  const geographyLabels = new Set<string>();
  if (analysis.locationHint) geographyLabels.add(analysis.locationHint);
  if (geography) {
    for (const g of [
      ...geography.observedGeography,
      ...geography.explicitTargetGeography,
      ...geography.researchScope,
      ...geography.businessOrigin,
    ]) {
      if (g.label) geographyLabels.add(g.label);
    }
  }
  for (const h of analysis.has) {
    if (h.type === 'LOCATION' && h.label) geographyLabels.add(h.label);
  }

  const explicitCount =
    analysis.has.filter((h) => h.basis === 'EXPLICIT').length +
    analysis.wants.filter((w) => w.basis === 'EXPLICIT').length;
  const evidenceConfidence: MarketGraphNode['evidenceConfidence'] =
    explicitCount >= 2 && analysis.classificationConfidence >= 0.88
      ? 'STRONG'
      : explicitCount >= 1 && analysis.classificationConfidence >= 0.75
        ? 'MODERATE'
        : 'WEAK';

  const nodeBase = {
    nodeId: params.nodeId,
    label: params.label,
    signalId: analysis.signalId,
    classification: analysis.classification,
    primaryIntent: analysis.intents.primary,
    actorRole: rep?.actorRole.primary ?? 'UNKNOWN',
    marketSide: rep?.marketSide.side ?? 'UNKNOWN',
    has: analysis.has,
    wants: analysis.wants,
    geographyLabels: [...geographyLabels],
    constraints: rep?.demandContext.constraints.map((c) => c.label) ?? [],
    preferences: rep?.demandContext.preferences.map((p) => p.label) ?? [],
    evidenceConfidence,
    contextSummary: rep?.marketSide.rationale ?? analysis.classificationReason ?? undefined,
  };

  return {
    ...nodeBase,
    contextualRole: deriveContextualRole(nodeBase),
  };
}

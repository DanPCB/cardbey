/**
 * Operator-facing match presentation — entity-relative labels over internal A/B orientation.
 * Does not change matcher output; only orients aNeedsFromB / bNeedsFromA for human review.
 */
import type { MarketMatch } from './marketMatchTypes.js';
import { resolveCapitalExchangeRole, type ExchangeRole } from './marketMatchCandidateRetrieval.js';

export type OperatorOverlapItem = {
  want: string;
  has: string;
  strength: string;
  reason?: string;
};

export type OperatorMatchDirection = {
  /** e.g. "Cardbey needs ↔ Brinc provides" */
  heading: string;
  leftLabel: string;
  rightLabel: string;
  leftRole: 'needs' | 'seeks';
  rightRole: 'provides' | 'offers';
  overlaps: OperatorOverlapItem[];
  emptyNote: string;
};

export type OperatorMatchPresentation = {
  demandNodeId: string;
  supplyNodeId: string;
  demandLabel: string;
  supplyLabel: string;
  pairTitle: string;
  capitalNeedDirection: OperatorMatchDirection;
  thesisFitDirection: OperatorMatchDirection;
  bandSummary: string | null;
};

type NodeRef = MarketMatch['nodeA'];

function mapOverlaps(items: MarketMatch['aNeedsFromB']): OperatorOverlapItem[] {
  return (items || []).map((o) => ({
    want: o.wantLabel || o.wantType || '—',
    has: o.hasLabel || o.hasType || '—',
    strength: o.strength,
    reason: o.reason,
  }));
}

/** Primary human label from graph node label or nodeId slug. */
export function shortEntityLabel(node: NodeRef): string {
  const label = node.label?.trim();
  if (label) {
    const primary = label.split('—')[0]?.split('–')[0]?.trim();
    if (primary) return primary;
  }
  const slug = node.nodeId.split(':').pop() ?? node.nodeId;
  if (/cardbey/i.test(slug)) return 'Cardbey';
  if (slug.startsWith('inv_')) {
    return slug
      .replace(/^inv_/, '')
      .replace(/_(au|sea|global|us|uk)$/i, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return slug;
}

function inferExchangeRole(node: NodeRef): ExchangeRole {
  if (node.nodeId.includes('seeker') || /cardbey-seed/i.test(node.nodeId)) return 'DEMAND';
  if (node.nodeId.includes('investor') || node.nodeId.includes(':inv_')) return 'SUPPLY';
  return resolveCapitalExchangeRole({
    nodeId: node.nodeId,
    has: [],
    wants: [],
    contextualRole: 'UNKNOWN',
    marketSide: node.marketSide,
    resourceType: node.nodeId.includes('seeker') ? 'capital_seeker' : node.nodeId.includes('investor') ? 'capital_provider' : null,
  });
}

function buildDirection(
  leftLabel: string,
  rightLabel: string,
  leftRole: 'needs' | 'seeks',
  rightRole: 'provides' | 'offers',
  overlaps: OperatorOverlapItem[],
  emptyNote: string,
): OperatorMatchDirection {
  const leftVerb = leftRole === 'needs' ? 'needs' : 'seeks';
  const rightVerb = rightRole === 'provides' ? 'provides' : 'offers';
  return {
    heading: `${leftLabel} ${leftVerb} ↔ ${rightLabel} ${rightVerb}`,
    leftLabel,
    rightLabel,
    leftRole,
    rightRole,
    overlaps,
    emptyNote,
  };
}

function buildBandSummary(
  band: string,
  capitalOverlaps: OperatorOverlapItem[],
  thesisOverlaps: OperatorOverlapItem[],
): string | null {
  if (band === 'ONE_WAY_STRONG') {
    const capitalOk = capitalOverlaps.length > 0;
    const thesisOk = thesisOverlaps.length > 0;
    return `Capital need ${capitalOk ? '✓' : '?'} · Investor thesis fit ${thesisOk ? '✓' : '?'} · Overall: ONE_WAY_STRONG`;
  }
  return null;
}

/**
 * Orient match overlaps to demand (capital seeker) vs supply (capital provider).
 * When roles cannot be determined, falls back to nodeA/nodeB with neutral labels.
 */
export function buildOperatorMatchPresentation(match: MarketMatch): OperatorMatchPresentation {
  const roleA = inferExchangeRole(match.nodeA);
  const roleB = inferExchangeRole(match.nodeB);

  let demandNode: NodeRef;
  let supplyNode: NodeRef;
  let demandWantsSupplyHas: MarketMatch['aNeedsFromB'];
  let supplyWantsDemandHas: MarketMatch['aNeedsFromB'];

  if (roleA === 'DEMAND' && roleB === 'SUPPLY') {
    demandNode = match.nodeA;
    supplyNode = match.nodeB;
    demandWantsSupplyHas = match.aNeedsFromB;
    supplyWantsDemandHas = match.bNeedsFromA;
  } else if (roleB === 'DEMAND' && roleA === 'SUPPLY') {
    demandNode = match.nodeB;
    supplyNode = match.nodeA;
    demandWantsSupplyHas = match.bNeedsFromA;
    supplyWantsDemandHas = match.aNeedsFromB;
  } else {
    demandNode = match.nodeA;
    supplyNode = match.nodeB;
    demandWantsSupplyHas = match.aNeedsFromB;
    supplyWantsDemandHas = match.bNeedsFromA;
  }

  const demandLabel = shortEntityLabel(demandNode);
  const supplyLabel = shortEntityLabel(supplyNode);
  const capitalOverlaps = mapOverlaps(demandWantsSupplyHas);
  const thesisOverlaps = mapOverlaps(supplyWantsDemandHas);

  return {
    demandNodeId: demandNode.nodeId,
    supplyNodeId: supplyNode.nodeId,
    demandLabel,
    supplyLabel,
    pairTitle: `${supplyLabel} ↔ ${demandLabel}`,
    capitalNeedDirection: buildDirection(
      demandLabel,
      supplyLabel,
      'needs',
      'provides',
      capitalOverlaps,
      'No clear capital overlap yet',
    ),
    thesisFitDirection: buildDirection(
      supplyLabel,
      demandLabel,
      'seeks',
      'offers',
      thesisOverlaps,
      'Insufficient investable-company representation in graph yet',
    ),
    bandSummary: buildBandSummary(match.reciprocalBand, capitalOverlaps, thesisOverlaps),
  };
}

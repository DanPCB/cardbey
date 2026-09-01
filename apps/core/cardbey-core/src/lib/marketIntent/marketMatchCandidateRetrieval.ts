/**
 * Market match candidate retrieval V1 — exchange-relative roles and plausible counterparty filtering.
 * Does NOT call evaluateReciprocalMatch or change bands.
 *
 * Architecture:
 *   MarketGraphNode (facets) → Exchange identification → Counterparty requirements → Candidate pair → MarketMatch V1
 */
import type { MarketGraphNode } from './marketGraphNode.js';
import type { ContextualMarketRole } from './marketGraphNode.js';

export type MarketExchangeKind = 'CAPITAL' | 'UNKNOWN';

export type ExchangeRole = 'SUPPLY' | 'DEMAND' | 'NON_PARTICIPANT';

export type NodeExchangeFacets = {
  /** Node-level structural facet — actor has both HAS and WANTS items */
  contextualRole: ContextualMarketRole;
  hasCapitalCapability: boolean;
  wantsCapital: boolean;
  wantsInvestmentOpportunity: boolean;
  hasInvestableBusinessProfile: boolean;
};

export type ExchangeRoleContext = {
  exchange: MarketExchangeKind;
  /** Role in this exchange only — not the permanent entity type */
  role: ExchangeRole;
  /** Operator-facing label, e.g. "Capital supply" */
  roleLabel: string;
  nodeFacets: NodeExchangeFacets;
};

export type CandidatePairDecision = {
  eligible: boolean;
  reason: string;
  exchange: MarketExchangeKind;
};

type GraphNodeLike = Pick<
  MarketGraphNode,
  'nodeId' | 'has' | 'wants' | 'contextualRole' | 'marketSide'
> & {
  domain?: string | null;
  resourceType?: string | null;
  capitalProfile?: { actorKind?: string | null } | null;
};

const CAPITAL_SUPPLY_PAT =
  /investment capital capability|capital capability|VC investment|accelerator investment|lead investment capability/i;
const CAPITAL_WANT_PAT =
  /\b(seed capital|raise|A\$[\d,]+|capital \(proposed\)|seeking capital|seed-stage investors)\b/i;
const OPP_WANT_PAT = /investment opportunit/i;
const INVESTABLE_HAS_PAT =
  /marketplace|platform|saas|commerce|intelligence|technology|business|startup|company/i;

function hasPat(items: Array<{ label?: string }>, pat: RegExp): boolean {
  return items.some((i) => pat.test(i.label ?? ''));
}

export function detectExchangeKind(node: GraphNodeLike): MarketExchangeKind {
  if (
    node.domain === 'CAPITAL' ||
    node.resourceType === 'capital_provider' ||
    node.resourceType === 'capital_seeker' ||
    node.nodeId.startsWith('capital:')
  ) {
    return 'CAPITAL';
  }
  return 'UNKNOWN';
}

export function buildNodeExchangeFacets(node: GraphNodeLike): NodeExchangeFacets {
  return {
    contextualRole: node.contextualRole,
    hasCapitalCapability: hasPat(node.has, CAPITAL_SUPPLY_PAT),
    wantsCapital: hasPat(node.wants, CAPITAL_WANT_PAT),
    wantsInvestmentOpportunity: hasPat(node.wants, OPP_WANT_PAT),
    hasInvestableBusinessProfile: hasPat(node.has, INVESTABLE_HAS_PAT),
  };
}

/**
 * Exchange-relative role for CAPITAL market.
 * Investors: HAS capital + WANTS opportunities → SUPPLY (even if node facets are DUAL).
 * Seekers: WANTS capital → DEMAND (even if node also HAS business capabilities).
 */
export function resolveCapitalExchangeRole(node: GraphNodeLike): ExchangeRole {
  const profileKind = node.capitalProfile?.actorKind;
  if (profileKind === 'CAPITAL_PROVIDER') return 'SUPPLY';
  if (profileKind === 'CAPITAL_SEEKER') return 'DEMAND';
  if (node.resourceType === 'capital_provider') return 'SUPPLY';
  if (node.resourceType === 'capital_seeker') return 'DEMAND';

  const facets = buildNodeExchangeFacets(node);
  if (facets.wantsCapital) return 'DEMAND';
  if (facets.hasCapitalCapability && facets.wantsInvestmentOpportunity) return 'SUPPLY';
  if (facets.hasCapitalCapability) return 'SUPPLY';
  return 'NON_PARTICIPANT';
}

export function buildExchangeRoleContext(node: GraphNodeLike): ExchangeRoleContext {
  const exchange = detectExchangeKind(node);
  const facets = buildNodeExchangeFacets(node);
  if (exchange !== 'CAPITAL') {
    return {
      exchange,
      role: 'NON_PARTICIPANT',
      roleLabel: '—',
      nodeFacets: facets,
    };
  }
  const role = resolveCapitalExchangeRole(node);
  const roleLabel =
    role === 'SUPPLY'
      ? 'Capital supply'
      : role === 'DEMAND'
        ? 'Capital demand'
        : 'Non-participant';
  return { exchange, role, roleLabel, nodeFacets: facets };
}

export function isEligibleCapitalMatchPair(
  a: GraphNodeLike,
  b: GraphNodeLike,
  options?: { allowCoInvestment?: boolean },
): CandidatePairDecision {
  const exchange: MarketExchangeKind = 'CAPITAL';
  if (detectExchangeKind(a) !== 'CAPITAL' || detectExchangeKind(b) !== 'CAPITAL') {
    return { eligible: false, reason: 'not_capital_exchange', exchange: 'UNKNOWN' };
  }

  const roleA = resolveCapitalExchangeRole(a);
  const roleB = resolveCapitalExchangeRole(b);

  if (roleA === 'NON_PARTICIPANT' || roleB === 'NON_PARTICIPANT') {
    return { eligible: false, reason: 'non_participant_in_capital_exchange', exchange };
  }

  if (roleA === roleB) {
    if (options?.allowCoInvestment && roleA === 'SUPPLY') {
      return { eligible: true, reason: 'co_investment_explicit', exchange };
    }
    return { eligible: false, reason: 'same_exchange_role', exchange };
  }

  return { eligible: true, reason: 'capital_supply_demand_counterparty', exchange };
}

/** Whether two nodes should be evaluated / surfaced as match candidates. */
export function isEligibleMatchPair(
  a: GraphNodeLike,
  b: GraphNodeLike,
  options?: { allowCoInvestment?: boolean },
): CandidatePairDecision {
  const kindA = detectExchangeKind(a);
  const kindB = detectExchangeKind(b);

  if (kindA === 'CAPITAL' && kindB === 'CAPITAL') {
    return isEligibleCapitalMatchPair(a, b, options);
  }

  // Non-capital exchanges: retain broad pairing until typed exchange rules exist.
  if (kindA === 'UNKNOWN' && kindB === 'UNKNOWN') {
    return { eligible: true, reason: 'untyped_exchange_legacy_pair', exchange: 'UNKNOWN' };
  }

  return { eligible: false, reason: 'mixed_or_unsupported_exchange', exchange: 'UNKNOWN' };
}

export function filterNodesByExchangeRole<T extends GraphNodeLike>(
  nodes: T[],
  params: { exchange?: MarketExchangeKind; exchangeRole?: ExchangeRole },
): T[] {
  return nodes.filter((n) => {
    const ctx = buildExchangeRoleContext(n);
    if (params.exchange && ctx.exchange !== params.exchange) return false;
    if (params.exchangeRole && ctx.role !== params.exchangeRole) return false;
    return true;
  });
}

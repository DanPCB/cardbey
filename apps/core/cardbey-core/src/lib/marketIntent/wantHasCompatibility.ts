/**
 * Structured WANTS ↔ HAS compatibility for reciprocal matching.
 * No embeddings — graph primitive only.
 */
import type { HasCategory, WantsCategory, HasWantsItem } from './types.js';

export type OverlapStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export type NeedCapabilityOverlap = {
  wantType: string;
  wantLabel: string;
  hasType: string;
  hasLabel: string;
  strength: OverlapStrength;
  reason: string;
  basis: 'EXPLICIT' | 'INFERRED';
};

/** Which HAS categories can materially address a WANTS category */
const WANT_SATISFIED_BY_HAS: Partial<Record<WantsCategory, HasCategory[]>> = {
  DISTRIBUTOR: ['CAPABILITY', 'BUSINESS', 'RELATIONSHIP', 'AUDIENCE'],
  RESELLER: ['CAPABILITY', 'BUSINESS', 'RELATIONSHIP'],
  SUPPLIER: ['PRODUCT', 'SERVICE', 'CAPABILITY', 'BUSINESS'],
  CUSTOMER: ['AUDIENCE', 'BUSINESS', 'CAPABILITY'],
  BUYER: ['AUDIENCE', 'BUSINESS'],
  INVESTOR: ['CAPITAL', 'ASSET', 'BUSINESS'],
  CAPITAL: ['CAPITAL', 'ASSET'],
  PARTNER: ['CAPABILITY', 'BUSINESS', 'RELATIONSHIP', 'KNOWLEDGE'],
  COLLABORATOR: ['CAPABILITY', 'KNOWLEDGE', 'BUSINESS'],
  EMPLOYEE: ['CAPABILITY', 'BUSINESS'],
  SOLUTION: ['SERVICE', 'PRODUCT', 'CAPABILITY', 'BUSINESS'],
  MARKET_ACCESS: ['LOCATION', 'CAPABILITY', 'BUSINESS', 'RELATIONSHIP'],
  PROMOTION: ['CAPABILITY', 'AUDIENCE', 'BUSINESS'],
  GROWTH: ['CAPABILITY', 'BUSINESS'],
  OTHER: ['PRODUCT', 'SERVICE', 'CAPABILITY', 'BUSINESS', 'OTHER'],
};

const WANT_KEYWORDS: Partial<Record<WantsCategory, string[]>> = {
  DISTRIBUTOR: ['distributor', 'distribution', 'channel', 'retail', 'stockist', 'agent', 'đại lý', 'reseller'],
  RESELLER: ['reseller', 'channel', 'retail', 'stockist', 'franchise'],
  SUPPLIER: ['supplier', 'manufacturer', 'factory', 'vendor', 'nhà cung cấp', 'nhà sản xuất', 'brand', 'paint', 'product'],
  CUSTOMER: ['customer', 'buyer', 'client', 'acquisition', 'booking'],
  BUYER: ['buyer', 'customer', 'purchaser'],
  INVESTOR: ['investor', 'capital', 'funding', 'investment', 'nhà đầu tư'],
  CAPITAL: ['capital', 'funding', 'investment'],
  PARTNER: ['partner', 'collaborat', 'đối tác', 'sponsor', 'brand'],
  COLLABORATOR: ['co-founder', 'cofounder', 'collaborat', 'teammate', 'technical'],
  EMPLOYEE: ['staff', 'manager', 'employee', 'hire', 'recruit'],
  SOLUTION: ['service', 'installer', 'grooming', 'warehouse', 'solution', 'security door'],
  MARKET_ACCESS: ['market', 'expansion', 'geographic', 'export', 'import'],
};

const HAS_KEYWORDS: Partial<Record<HasCategory, string[]>> = {
  PRODUCT: ['product', 'paint', 'packaging', 'food', 'coffee', 'skincare', 'beef', 'manufactur'],
  SERVICE: ['service', 'installation', 'security door', 'grooming', 'detailing', 'supply'],
  CAPABILITY: [
    'distribution',
    'channel',
    'retail',
    'network',
    'manufacturing',
    'contractor',
    'logistics',
    'audience',
    'followers',
  ],
  BUSINESS: ['business', 'company', 'retailer', 'distributor', 'startup', 'restaurant', 'factory'],
  CAPITAL: ['capital', 'investment', 'family office', 'angel', 'fund'],
  ASSET: ['asset', 'vehicle', 'property'],
  AUDIENCE: ['audience', 'followers', 'customer base'],
  RELATIONSHIP: ['partner', 'channel', 'network', 'relationship'],
  LOCATION: ['location', 'warehouse', 'melbourne', 'vietnam', 'australia'],
};

const DISTRIBUTOR_HAS_KEYWORDS = [
  'distributor',
  'distribution',
  'channel',
  'retail',
  'stockist',
  'agent',
  'đại lý',
  'reseller',
  'franchise',
];

function hasDistributionChannelSignal(label: string): boolean {
  const lower = label.toLowerCase();
  return DISTRIBUTOR_HAS_KEYWORDS.some((k) => lower.includes(k));
}

function isCapitalFlowOverlap(want: HasWantsItem, has: HasWantsItem): boolean {
  const wantType = want.type as WantsCategory;
  const hasType = has.type as HasCategory;
  if (wantType === 'INVESTOR' && (hasType === 'CAPITAL' || hasType === 'ASSET')) return true;
  if (wantType === 'CAPITAL' && hasType === 'CAPITAL') return true;
  if (wantType === 'SOLUTION' && hasType === 'BUSINESS' && /startup|business|company|saas|fintech|edtech/i.test(has.label)) {
    return true;
  }
  if (wantType === 'SOLUTION' && hasType === 'CAPITAL') return true;
  if (wantType === 'INVESTOR' && hasType === 'BUSINESS' && /investor|angel|family office|capital/i.test(has.label)) {
    return true;
  }
  return false;
}

function keywordOverlap(a: string, keywords: string[]): boolean {
  const lower = a.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function productDomainOverlap(wantLabel: string, hasLabel: string): boolean {
  const domains = [
    ['paint', 'coating', 'sơn'],
    ['packaging', 'container', 'bao bì'],
    ['security door', 'door'],
    ['food', 'sauce', 'noodle', 'beef'],
    ['coffee'],
    ['pet', 'grooming', 'mèo'],
    ['skincare', 'beauty'],
  ];
  const wl = wantLabel.toLowerCase();
  const hl = hasLabel.toLowerCase();
  return domains.some((group) => group.some((k) => wl.includes(k)) && group.some((k) => hl.includes(k)));
}

export function evaluateWantHasOverlap(want: HasWantsItem, has: HasWantsItem): NeedCapabilityOverlap | null {
  const wantType = want.type as WantsCategory;
  const hasType = has.type as HasCategory;
  const allowedHas = WANT_SATISFIED_BY_HAS[wantType] ?? ['PRODUCT', 'SERVICE', 'CAPABILITY', 'BUSINESS', 'OTHER'];

  if (!allowedHas.includes(hasType)) {
    return null;
  }

  if (wantType === 'PARTNER' || wantType === 'COLLABORATOR') {
    const partnerSignal =
      productDomainOverlap(want.label, has.label) ||
      keywordOverlap(has.label, ['partner', 'collaborat', 'co-founder', 'cofounder', 'franchise', 'operating', 'sponsor']);
    if (!partnerSignal) {
      return null;
    }
  }

  if (wantType === 'SOLUTION') {
    const capitalSolution = /startup|invest|business|saas|fintech|edtech/i.test(want.label);
    const propertySolution = /warehouse|space|property|installer|grooming|plumber|security/i.test(want.label);
    if (propertySolution) {
      const hasPropertySignal = keywordOverlap(has.label, [
        'warehouse',
        'service',
        'installer',
        'grooming',
        'space',
        'property',
        'logistics',
        'solution',
        'security',
      ]);
      if (!hasPropertySignal) {
        return null;
      }
    } else if (!capitalSolution && !productDomainOverlap(want.label, has.label) && !isCapitalFlowOverlap(want, has)) {
      return null;
    }
  }

  const wantKeywords = WANT_KEYWORDS[wantType] ?? [];
  const hasKeywords = HAS_KEYWORDS[hasType] ?? [];

  if (wantType === 'DISTRIBUTOR' || wantType === 'RESELLER') {
    if (!hasDistributionChannelSignal(has.label)) {
      return null;
    }
  }

  const labelMatch = keywordOverlap(has.label, wantKeywords) || productDomainOverlap(want.label, has.label);
  const capitalFlow = isCapitalFlowOverlap(want, has);

  let strength: OverlapStrength;
  let reason: string;

  if (capitalFlow && (want.basis === 'EXPLICIT' || has.basis === 'EXPLICIT')) {
    strength = 'STRONG';
    reason = `Capital flow alignment: want ${wantType} ↔ has ${hasType}`;
  } else if (productDomainOverlap(want.label, has.label) && ['PRODUCT', 'SERVICE', 'CAPABILITY'].includes(hasType)) {
    strength = 'STRONG';
    reason = `Product/service domain alignment: "${want.label}" ↔ "${has.label}"`;
  } else if (labelMatch && want.basis === 'EXPLICIT' && has.basis === 'EXPLICIT') {
    strength = 'STRONG';
    reason = `Explicit want "${want.label}" addressed by explicit has "${has.label}"`;
  } else if (labelMatch) {
    strength = 'MODERATE';
    reason = `Keyword alignment between want "${want.label}" and has "${has.label}"`;
  } else if (wantType === 'SUPPLIER' && ['PRODUCT', 'SERVICE'].includes(hasType) && keywordOverlap(has.label, ['manufactur', 'factory', 'supplier', 'product'])) {
    strength = 'MODERATE';
    reason = `Supplier want addressed by product/service has "${has.label}"`;
  } else {
    return null;
  }

  return {
    wantType: want.type,
    wantLabel: want.label,
    hasType: has.type,
    hasLabel: has.label,
    strength,
    reason,
    basis: want.basis === 'EXPLICIT' && has.basis === 'EXPLICIT' ? 'EXPLICIT' : 'INFERRED',
  };
}

export function computeDirectedOverlaps(
  wanterHas: HasWantsItem[],
  wanterWants: HasWantsItem[],
  supplierHas: HasWantsItem[],
): NeedCapabilityOverlap[] {
  const overlaps: NeedCapabilityOverlap[] = [];

  for (const want of wanterWants) {
    let best: NeedCapabilityOverlap | null = null;
    for (const has of supplierHas) {
      const overlap = evaluateWantHasOverlap(want, has);
      if (!overlap) continue;
      if (
        !best ||
        strengthRank(overlap.strength) > strengthRank(best.strength) ||
        (strengthRank(overlap.strength) === strengthRank(best.strength) &&
          overlap.basis === 'EXPLICIT' &&
          best.basis !== 'EXPLICIT')
      ) {
        best = overlap;
      }
    }
    if (best) overlaps.push(best);
  }

  return overlaps;
}

function strengthRank(s: OverlapStrength): number {
  return s === 'STRONG' ? 3 : s === 'MODERATE' ? 2 : 1;
}

export function directedOverlapScore(overlaps: NeedCapabilityOverlap[]): number {
  if (!overlaps.length) return 0;
  return overlaps.reduce((sum, o) => sum + strengthRank(o.strength), 0);
}

export function bestDirectedStrength(overlaps: NeedCapabilityOverlap[]): OverlapStrength | null {
  if (!overlaps.length) return null;
  const max = Math.max(...overlaps.map((o) => strengthRank(o.strength)));
  return max >= 3 ? 'STRONG' : max >= 2 ? 'MODERATE' : 'WEAK';
}

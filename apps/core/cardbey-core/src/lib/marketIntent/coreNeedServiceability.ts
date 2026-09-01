/**
 * Core Need Serviceability — derives how directly Cardbey can address the primary expressed need.
 * Consumes canonical capability authority dynamically (no hard-coded business rules).
 */
import type { MarketIntentAnalysis, WantsCategory, MarketIntentFamily } from './types.js';
import type { CardbeyCapabilityMatch } from './opportunityTypes.js';
import type { MarketResearchObjective } from './marketResearchObjective.js';
import { UNAVAILABLE_DESIRED_CAPABILITIES } from './marketCapabilityCatalog.js';

export type CoreNeedServiceability =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'ENABLING_ONLY'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export type CommercialSignalStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export type CoreNeedAssessment = {
  coreNeedLabel: string;
  coreNeedKey: string;
  serviceability: CoreNeedServiceability;
  commercialSignalStrength: CommercialSignalStrength;
  directCapabilityIds: string[];
  enablingCapabilityIds: string[];
  unavailableLabels: string[];
  explanation: string;
  fitCapReason: string | null;
};

type CoreNeedSpec = {
  label: string;
  unavailableKeys: string[];
  directCapabilityIds: string[];
  enablingCapabilityIds: string[];
};

const INTENT_CORE_NEED: Partial<Record<MarketIntentFamily, CoreNeedSpec>> = {
  LAUNCH: {
    label: 'Business launch / online presence',
    unavailableKeys: [],
    directCapabilityIds: ['create_store', 'structured_store_build', 'generate_mini_website', 'create_promotion'],
    enablingCapabilityIds: ['market_research'],
  },
  HIRE: {
    label: 'Staff recruitment',
    unavailableKeys: ['co_founder'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research'],
  },
  COLLABORATE: {
    label: 'Co-founder / collaborator matching',
    unavailableKeys: ['co_founder'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'generate_mini_website'],
  },
};

const WANT_CORE_NEED: Partial<Record<WantsCategory, CoreNeedSpec>> = {
  DISTRIBUTOR: {
    label: 'Distributor network matching',
    unavailableKeys: ['distributor'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'create_promotion', 'structured_store_build', 'edit_artifact'],
  },
  RESELLER: {
    label: 'Channel / reseller matching',
    unavailableKeys: ['distributor', 'partner'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'create_promotion', 'structured_store_build'],
  },
  PARTNER: {
    label: 'Business / operating partner matching',
    unavailableKeys: ['partner'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'generate_mini_website', 'structured_store_build'],
  },
  INVESTOR: {
    label: 'Investor / capital matching',
    unavailableKeys: ['investor'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'generate_mini_website'],
  },
  CAPITAL: {
    label: 'Capital partner matching',
    unavailableKeys: ['investor'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'generate_mini_website'],
  },
  CUSTOMER: {
    label: 'Customer acquisition',
    unavailableKeys: ['direct_customer_acquisition'],
    directCapabilityIds: ['create_promotion', 'publish_to_social'],
    enablingCapabilityIds: ['market_research', 'create_store', 'analyze_store'],
  },
  BUYER: {
    label: 'Buyer acquisition',
    unavailableKeys: ['direct_customer_acquisition'],
    directCapabilityIds: ['create_promotion'],
    enablingCapabilityIds: ['market_research', 'create_store'],
  },
  SUPPLIER: {
    label: 'Supplier sourcing',
    unavailableKeys: [],
    directCapabilityIds: ['market_research'],
    enablingCapabilityIds: ['create_promotion'],
  },
  EMPLOYEE: {
    label: 'Staff recruitment',
    unavailableKeys: ['co_founder'],
    directCapabilityIds: [],
    enablingCapabilityIds: [],
  },
  COLLABORATOR: {
    label: 'Co-founder / collaborator matching',
    unavailableKeys: ['co_founder'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research'],
  },
  MARKET_ACCESS: {
    label: 'Market access / expansion',
    unavailableKeys: ['distributor'],
    directCapabilityIds: [],
    enablingCapabilityIds: ['market_research', 'edit_artifact', 'structured_store_build'],
  },
  PROMOTION: {
    label: 'Marketing promotion',
    unavailableKeys: [],
    directCapabilityIds: ['create_promotion', 'publish_to_social', 'create_campaign'],
    enablingCapabilityIds: ['market_research', 'create_store'],
  },
  GROWTH: {
    label: 'Business growth',
    unavailableKeys: [],
    directCapabilityIds: ['create_promotion', 'market_research'],
    enablingCapabilityIds: ['create_store', 'publish_to_social'],
  },
};

const WANT_PRIORITY: WantsCategory[] = [
  'DISTRIBUTOR',
  'INVESTOR',
  'CAPITAL',
  'PARTNER',
  'RESELLER',
  'MARKET_ACCESS',
  'SUPPLIER',
  'CUSTOMER',
  'BUYER',
  'PROMOTION',
  'GROWTH',
  'EMPLOYEE',
  'COLLABORATOR',
  'SOLUTION',
  'OTHER',
];

function pickPrimaryCoreNeed(analysis: MarketIntentAnalysis): CoreNeedSpec & { key: string } {
  if (analysis.intents.primary === 'LAUNCH' && INTENT_CORE_NEED.LAUNCH) {
    const hasLaunchContext =
      analysis.has.some((h) => h.type === 'PRODUCT' || h.type === 'BUSINESS') ||
      analysis.wants.some((w) => ['CUSTOMER', 'BUYER', 'PROMOTION', 'GROWTH'].includes(w.type));
    if (hasLaunchContext) {
      return { key: 'launch', ...INTENT_CORE_NEED.LAUNCH };
    }
  }

  for (const type of WANT_PRIORITY) {
    const want = analysis.wants.find((w) => w.type === type);
    if (want && WANT_CORE_NEED[type]) {
      return { key: type.toLowerCase(), ...WANT_CORE_NEED[type]! };
    }
  }

  const intent = analysis.intents.primary;
  if (intent && INTENT_CORE_NEED[intent]) {
    return { key: intent.toLowerCase(), ...INTENT_CORE_NEED[intent]! };
  }

  if (intent === 'DISTRIBUTE') {
    return { key: 'distribute', ...WANT_CORE_NEED.DISTRIBUTOR! };
  }
  if (intent === 'EXPAND') {
    return { key: 'expand', ...WANT_CORE_NEED.MARKET_ACCESS! };
  }
  if (intent === 'PARTNER') {
    return { key: 'partner', ...WANT_CORE_NEED.PARTNER! };
  }
  if (intent === 'INVEST') {
    return { key: 'invest', ...WANT_CORE_NEED.INVESTOR! };
  }
  if (intent === 'BUY' || intent === 'SUPPLY') {
    return { key: 'supplier', ...WANT_CORE_NEED.SUPPLIER! };
  }
  if (intent === 'PROMOTE' || intent === 'SELL') {
    return { key: 'customer', ...WANT_CORE_NEED.CUSTOMER! };
  }

  return {
    key: 'general',
    label: 'General business growth',
    unavailableKeys: [],
    directCapabilityIds: ['create_promotion', 'market_research'],
    enablingCapabilityIds: ['create_store'],
  };
}

function hasDirectCapabilityMatch(
  matches: CardbeyCapabilityMatch[],
  capabilityIds: string[],
): boolean {
  return capabilityIds.some((id) => {
    const match = matches.find((m) => m.capabilityId === id);
    return (
      match &&
      (match.fitLevel === 'DIRECT_MATCH' || match.fitLevel === 'SUPPORTING_MATCH') &&
      match.availability !== 'UNAVAILABLE'
    );
  });
}

function hasStrongDirectMatch(matches: CardbeyCapabilityMatch[], capabilityIds: string[]): boolean {
  return capabilityIds.some((id) => {
    const match = matches.find((m) => m.capabilityId === id);
    return match?.fitLevel === 'DIRECT_MATCH' && match.availability === 'AVAILABLE';
  });
}

function resolveUnavailableLabels(unavailableKeys: string[]): string[] {
  return UNAVAILABLE_DESIRED_CAPABILITIES.filter((u) =>
    unavailableKeys.some((k) => u.needKey === k || u.needKey.includes(k) || k.includes(u.needKey)),
  ).map((u) => u.label);
}

export function deriveCommercialSignalStrength(analysis: MarketIntentAnalysis): CommercialSignalStrength {
  if (analysis.classification !== 'COMMERCIAL') return 'WEAK';
  const conf = analysis.classificationConfidence;
  const explicitWants = analysis.wants.filter((w) => w.basis === 'EXPLICIT').length;
  if (conf >= 0.88 && analysis.intents.primary && explicitWants > 0) return 'STRONG';
  if (conf >= 0.75 && analysis.intents.primary) return 'MODERATE';
  return 'WEAK';
}

export function deriveCoreNeedAssessment(params: {
  analysis: MarketIntentAnalysis;
  matches: CardbeyCapabilityMatch[];
  researchObjective?: MarketResearchObjective | null;
}): CoreNeedAssessment {
  const { analysis, matches } = params;
  const spec = pickPrimaryCoreNeed(analysis);
  const unavailableLabels = resolveUnavailableLabels(spec.unavailableKeys);
  const hasUnavailableCore = unavailableLabels.length > 0;
  const directMatch = hasDirectCapabilityMatch(matches, spec.directCapabilityIds);
  const strongDirect = hasStrongDirectMatch(matches, spec.directCapabilityIds);
  const enablingMatch = hasDirectCapabilityMatch(matches, spec.enablingCapabilityIds);

  let serviceability: CoreNeedServiceability;
  let explanation: string;

  if (analysis.classification !== 'COMMERCIAL') {
    serviceability = 'UNKNOWN';
    explanation = 'Non-commercial signal — core need serviceability not applicable';
  } else if (!hasUnavailableCore && strongDirect) {
    serviceability = 'AVAILABLE';
    explanation = `Cardbey can directly address "${spec.label}" with available capabilities`;
  } else if (!hasUnavailableCore && directMatch) {
    serviceability = 'PARTIAL';
    explanation = `Cardbey can partially address "${spec.label}" — some capabilities require onboarding or are partial`;
  } else if (hasUnavailableCore && enablingMatch) {
    serviceability = 'ENABLING_ONLY';
    explanation = `Core need "${spec.label}" is not directly serviceable (${unavailableLabels.join(', ')}); Cardbey can provide enabling research/presentation value`;
  } else if (hasUnavailableCore && !enablingMatch) {
    serviceability = 'UNAVAILABLE';
    explanation = `Core need "${spec.label}" cannot be addressed — ${unavailableLabels.join(', ')}`;
  } else if (enablingMatch) {
    serviceability = 'ENABLING_ONLY';
    explanation = `Cardbey can provide enabling support for "${spec.label}" but not full direct fulfillment`;
  } else if (directMatch) {
    serviceability = 'PARTIAL';
    explanation = `Partial direct value for "${spec.label}"`;
  } else {
    serviceability = 'UNKNOWN';
    explanation = `Insufficient capability alignment for "${spec.label}"`;
  }

  const commercialSignalStrength = deriveCommercialSignalStrength(analysis);

  return {
    coreNeedLabel: spec.label,
    coreNeedKey: spec.key,
    serviceability,
    commercialSignalStrength,
    directCapabilityIds: spec.directCapabilityIds,
    enablingCapabilityIds: spec.enablingCapabilityIds,
    unavailableLabels,
    explanation,
    fitCapReason: null,
  };
}

export function applyServiceabilityFitCap(params: {
  rawBand: import('./opportunityTypes.js').FitBand;
  rawScore: number;
  assessment: CoreNeedAssessment;
  capabilityFit: number;
  matches: CardbeyCapabilityMatch[];
}): { band: import('./opportunityTypes.js').FitBand; score: number; fitCapReason: string | null } {
  const { rawBand, rawScore, assessment, capabilityFit, matches } = params;

  if (
    rawBand === 'NOT_APPLICABLE' ||
    rawBand === 'NOT_A_CARDBEY_OPPORTUNITY' ||
    rawBand === 'INSUFFICIENT_EVIDENCE'
  ) {
    return { band: rawBand, score: rawScore, fitCapReason: null };
  }

  const strongDirect = hasStrongDirectMatch(matches, assessment.directCapabilityIds);

  const capTo = (
    maxBand: import('./opportunityTypes.js').FitBand,
    maxScore: number,
    reason: string,
  ) => {
    const bandOrder = ['HIGH_FIT', 'MEDIUM_FIT', 'LOW_FIT', 'NOT_A_CARDBEY_OPPORTUNITY'];
    const rawIdx = bandOrder.indexOf(rawBand);
    const maxIdx = bandOrder.indexOf(maxBand);
    if (rawIdx === -1 || maxIdx === -1 || rawIdx >= maxIdx) {
      return { band: rawBand, score: rawScore, fitCapReason: null };
    }
    return {
      band: maxBand,
      score: Math.min(rawScore, maxScore),
      fitCapReason: reason,
    };
  };

  switch (assessment.serviceability) {
    case 'AVAILABLE':
      return { band: rawBand, score: rawScore, fitCapReason: null };
    case 'PARTIAL':
      if (rawBand === 'HIGH_FIT' && !(strongDirect && capabilityFit >= 62)) {
        return capTo(
          'MEDIUM_FIT',
          71,
          'Core need partially serviceable — HIGH_FIT requires strong direct capability match',
        );
      }
      return { band: rawBand, score: rawScore, fitCapReason: null };
    case 'ENABLING_ONLY':
      if (rawBand === 'HIGH_FIT') {
        return capTo(
          'MEDIUM_FIT',
          71,
          'Core need is enabling-only — Cardbey can research/prepare but not directly fulfill the central request',
        );
      }
      return { band: rawBand, score: rawScore, fitCapReason: null };
    case 'UNAVAILABLE':
      if (rawBand === 'HIGH_FIT' || rawBand === 'MEDIUM_FIT') {
        return capTo('LOW_FIT', 41, 'Core need unavailable with limited enabling value');
      }
      return { band: rawBand, score: rawScore, fitCapReason: null };
    case 'UNKNOWN':
      if (rawBand === 'HIGH_FIT') {
        return capTo('MEDIUM_FIT', 68, 'Core need serviceability uncertain — confidence-limited');
      }
      return { band: rawBand, score: rawScore, fitCapReason: null };
    default:
      return { band: rawBand, score: rawScore, fitCapReason: null };
  }
}

export function isResearchOnlySolutionPreferred(
  serviceability: CoreNeedServiceability,
  objectiveType?: string | null,
): boolean {
  if (!['ENABLING_ONLY', 'UNAVAILABLE', 'UNKNOWN'].includes(serviceability)) return false;
  return [
    'DISTRIBUTION_EXPANSION',
    'PARTNER_SEARCH',
    'INVESTMENT_READINESS',
    'MARKET_ENTRY',
    'GEOGRAPHIC_EXPANSION',
  ].includes(objectiveType ?? '');
}

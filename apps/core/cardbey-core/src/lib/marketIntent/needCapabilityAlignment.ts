import type { MarketIntentFamily } from './types.js';
import type { MarketResearchObjectiveType } from './marketResearchObjective.js';

export type NeedAlignmentBand = 'CORE_TO_NEED' | 'ENABLING' | 'SUPPORTING' | 'UNRELATED';

const ALIGNMENT_RANK: Record<NeedAlignmentBand, number> = {
  CORE_TO_NEED: 0,
  ENABLING: 1,
  SUPPORTING: 2,
  UNRELATED: 3,
};

const CAPABILITY_ALIGNMENT_BY_OBJECTIVE: Partial<
  Record<MarketResearchObjectiveType, Record<string, NeedAlignmentBand>>
> = {
  DISTRIBUTION_EXPANSION: {
    market_research: 'CORE_TO_NEED',
    structured_store_build: 'ENABLING',
    edit_artifact: 'ENABLING',
    create_store: 'SUPPORTING',
    create_promotion: 'SUPPORTING',
  },
  PARTNER_SEARCH: {
    market_research: 'CORE_TO_NEED',
    generate_mini_website: 'ENABLING',
    structured_store_build: 'ENABLING',
    create_store: 'SUPPORTING',
    create_promotion: 'SUPPORTING',
  },
  INVESTMENT_READINESS: {
    market_research: 'CORE_TO_NEED',
    generate_mini_website: 'ENABLING',
    create_store: 'SUPPORTING',
    create_promotion: 'SUPPORTING',
  },
  MARKET_ENTRY: {
    market_research: 'CORE_TO_NEED',
    structured_store_build: 'ENABLING',
    create_store: 'ENABLING',
    edit_artifact: 'ENABLING',
    create_promotion: 'SUPPORTING',
  },
  GEOGRAPHIC_EXPANSION: {
    market_research: 'CORE_TO_NEED',
    create_store: 'ENABLING',
    create_promotion: 'SUPPORTING',
  },
  CUSTOMER_ACQUISITION: {
    create_promotion: 'CORE_TO_NEED',
    publish_to_social: 'CORE_TO_NEED',
    market_research: 'ENABLING',
    create_store: 'ENABLING',
  },
};

const CAPABILITY_ALIGNMENT_BY_INTENT: Partial<
  Record<MarketIntentFamily, Record<string, NeedAlignmentBand>>
> = {
  DISTRIBUTE: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.DISTRIBUTION_EXPANSION,
  PARTNER: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.PARTNER_SEARCH,
  INVEST: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.INVESTMENT_READINESS,
  EXPAND: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.GEOGRAPHIC_EXPANSION,
  LAUNCH: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.MARKET_ENTRY,
  SELL: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.CUSTOMER_ACQUISITION,
  PROMOTE: CAPABILITY_ALIGNMENT_BY_OBJECTIVE.CUSTOMER_ACQUISITION,
};

export function getCapabilityNeedAlignment(
  capabilityId: string,
  params: { objectiveType?: MarketResearchObjectiveType | null; primaryIntent?: MarketIntentFamily | null },
): NeedAlignmentBand {
  const fromObjective =
    params.objectiveType && CAPABILITY_ALIGNMENT_BY_OBJECTIVE[params.objectiveType]?.[capabilityId];
  if (fromObjective) return fromObjective;

  const fromIntent =
    params.primaryIntent && CAPABILITY_ALIGNMENT_BY_INTENT[params.primaryIntent]?.[capabilityId];
  if (fromIntent) return fromIntent;

  return 'SUPPORTING';
}

export function alignmentRank(band: NeedAlignmentBand): number {
  return ALIGNMENT_RANK[band];
}

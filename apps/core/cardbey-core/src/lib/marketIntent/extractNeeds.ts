import type { MarketIntentAnalysis, WantsCategory, MarketIntentFamily } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';

export interface ExtractedNeed {
  key: string;
  label: string;
  source: 'wants' | 'intent' | 'has' | 'inferred';
  weight: number;
}

const WANTS_NEED_KEYS: Record<WantsCategory, string[]> = {
  CUSTOMER: ['customer', 'growth', 'promotion', 'marketing'],
  BUYER: ['customer', 'sell'],
  SUPPLIER: ['supply', 'research'],
  PARTNER: ['partner', 'expansion', 'business'],
  INVESTOR: ['investor'],
  CAPITAL: ['investor', 'growth'],
  DISTRIBUTOR: ['distributor', 'market_access', 'expansion'],
  RESELLER: ['distributor', 'partner', 'growth'],
  EMPLOYEE: ['hire'],
  COLLABORATOR: ['co_founder', 'partner'],
  MARKET_ACCESS: ['market_access', 'expansion', 'research', 'localization'],
  PROMOTION: ['promotion', 'marketing', 'content', 'social'],
  GROWTH: ['growth', 'customer', 'promotion', 'marketing'],
  SOLUTION: ['growth', 'business'],
  OTHER: ['business'],
};

const INTENT_NEED_KEYS: Partial<Record<MarketIntentFamily, string[]>> = {
  DISTRIBUTE: ['distributor', 'market_access', 'expansion', 'research', 'localization', 'promotion'],
  EXPAND: ['expansion', 'market_access', 'research', 'business', 'partner'],
  PARTNER: ['partner', 'business', 'promotion', 'online_presence'],
  PROMOTE: ['promotion', 'marketing', 'content', 'social', 'customer'],
  SELL: ['customer', 'promotion', 'online_presence'],
  LAUNCH: ['launch', 'business', 'online_presence', 'store'],
  BUY: ['supply', 'research'],
  SUPPLY: ['supply'],
  INVEST: ['investor'],
  COLLABORATE: ['co_founder', 'partner'],
  HIRE: ['hire'],
  SOLVE_BUSINESS_PROBLEM: ['growth', 'promotion', 'research'],
  OTHER_COMMERCIAL: ['business', 'growth'],
};

export function extractNeedsFromContext(
  analysis: MarketIntentAnalysis,
  research: MarketEntityResearch | null,
): ExtractedNeed[] {
  const needs = new Map<string, ExtractedNeed>();

  const add = (key: string, label: string, source: ExtractedNeed['source'], weight: number) => {
    const existing = needs.get(key);
    if (!existing || existing.weight < weight) {
      needs.set(key, { key, label, source, weight });
    }
  };

  for (const want of analysis.wants) {
    const keys = WANTS_NEED_KEYS[want.type as WantsCategory] ?? ['business'];
    for (const key of keys) {
      add(key, want.label, 'wants', want.confidence);
    }
  }

  if (analysis.intents.primary) {
    const keys = INTENT_NEED_KEYS[analysis.intents.primary] ?? ['business'];
    for (const key of keys) {
      add(key, analysis.intents.primary, 'intent', 0.85);
    }
  }

  for (const secondary of analysis.intents.secondary) {
    const keys = INTENT_NEED_KEYS[secondary] ?? [];
    for (const key of keys) {
      add(key, secondary, 'intent', 0.65);
    }
  }

  if (research?.offerings?.length) {
    add('offering', 'product/service presentation', 'inferred', 0.6);
  }

  if (analysis.has.some((h) => h.type === 'PRODUCT' || h.type === 'SERVICE')) {
    add('catalog', 'offering reconstruction', 'has', 0.7);
  }

  const text = analysis.classificationReason?.toLowerCase() ?? '';
  if (/cleaning|service business|customers/i.test(text)) {
    add('customer', 'customer acquisition', 'inferred', 0.75);
  }

  return [...needs.values()].sort((a, b) => b.weight - a.weight);
}

export function isConsumerTransactionSignal(analysis: MarketIntentAnalysis): boolean {
  if (analysis.intents.primary !== 'SELL') return false;
  return analysis.has.some(
    (h) =>
      h.type === 'ASSET' &&
      /vehicle|car|toyota|motor|xe/i.test(h.label),
  );
}

export function isNonBusinessOpportunity(
  entityKind: string,
  analysis: MarketIntentAnalysis,
): boolean {
  if (entityKind === 'PERSON' && isConsumerTransactionSignal(analysis)) return true;
  if (entityKind === 'PROJECT' && analysis.intents.primary === 'COLLABORATE') return false; // partial fit
  return false;
}

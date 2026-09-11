/**
 * Grow Your Business V1 — user-facing orchestration over canonical Market Intent G1 + reciprocal matcher.
 *
 * Does not admit nodes, overwrite business profiles, or expose admin terminology.
 */
import { ingestMarketSignal } from '../marketIntent/ingestMarketSignal.js';
import { projectMarketGraphNode } from '../marketIntent/marketGraphNode.js';
import { evaluateReciprocalMatchPair } from '../marketIntent/evaluateReciprocalMatch.js';
import { isEligibleMatchPair } from '../marketIntent/marketMatchCandidateRetrieval.js';
import { launchpadPersistentMarketGraph } from '../marketIntent/capital/persistentMarketGraphStore.js';
import type { LlmGenerateFn } from '../marketIntent/extractMarketIntentWithLlm.js';
import type { HasWantsItem, MarketIntentAnalysis } from '../marketIntent/types.js';
import type { MarketGraphNode } from '../marketIntent/marketGraphNode.js';
import type { MarketMatch } from '../marketIntent/marketMatchTypes.js';
import type { ListedGraphNode } from '../marketIntent/capital/persistentMarketGraphStore.js';
import {
  fetchUserStoresForDisambiguation,
  tryAutoResolveSingleStoreId,
  validateUserStoreId,
} from '../intake/resolveStoreAmbiguity.js';
import { GROW_YOUR_BUSINESS_MAX_RAW_TEXT } from './growYourBusinessConfig.js';
import {
  mergeBusinessContextIntoHas,
  projectGrowUnderstanding,
  resolveGrowClarification,
} from './projectGrowUnderstanding.js';
import type {
  GrowAnalyzeInput,
  GrowAnalyzeResult,
  GrowBusinessContext,
  GrowNextAction,
  GrowOpportunity,
  GrowOpportunityKind,
} from './growYourBusinessTypes.js';

export class GrowYourBusinessError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'GrowYourBusinessError';
    this.code = code;
  }
}

const IMPLEMENTED_NEXT_ACTIONS: GrowNextAction[] = [
  { id: 'research_market' },
  { id: 'create_promotion' },
  { id: 'improve_profile' },
  { id: 'save_request' },
];

const RESEARCH_SOURCE_TYPES = new Set([
  'licensed_feed',
  'partner_feed',
  'csv_import',
  'community_post',
  'executive_growth',
]);

export type GrowAnalyzeDeps = {
  llmGenerate?: LlmGenerateFn;
  forceRuleAssisted?: boolean;
  listCounterparties?: () => Promise<ListedGraphNode[]>;
  loadBusinessContext?: (userId: string, storeId?: string | null) => Promise<GrowBusinessContext | null>;
};

function failed(message: string, retryable = true): GrowAnalyzeResult {
  return {
    ok: false,
    status: 'failed',
    understanding: null,
    clarification: null,
    opportunities: [],
    nextActions: IMPLEMENTED_NEXT_ACTIONS,
    empty: true,
    retryable,
    error: message,
  };
}

function humanOverlapLine(
  overlaps: MarketMatch['aNeedsFromB'],
  speakerHas: 'you' | 'they',
): string | null {
  const best = overlaps.find((item) => item.strength === 'STRONG') || overlaps[0];
  if (!best) return null;
  if (speakerHas === 'you') {
    return `You want ${best.wantLabel}, and they have ${best.hasLabel}.`;
  }
  return `They want ${best.wantLabel}, and you have ${best.hasLabel}.`;
}

function classifyOpportunityKind(
  match: MarketMatch,
  counterparty: ListedGraphNode,
): GrowOpportunityKind {
  const sourceType = String(counterparty.sourceType || '').toLowerCase();
  const isResearch =
    RESEARCH_SOURCE_TYPES.has(sourceType) ||
    counterparty.domain === 'CAPITAL' ||
    String(counterparty.nodeId || '').startsWith('capital:');

  if (match.reciprocalBand === 'STRONG_RECIPROCAL' && match.evidenceConfidence === 'STRONG' && !isResearch) {
    return 'verified_match';
  }
  if (isResearch || match.reciprocalBand === 'ONE_WAY_STRONG') {
    return 'research_candidate';
  }
  return 'potential_match';
}

function toOpportunity(userNode: MarketGraphNode, counterparty: ListedGraphNode, match: MarketMatch): GrowOpportunity {
  const kind = classifyOpportunityKind(match, counterparty);
  const location = counterparty.geographyLabels.filter(Boolean).join(' · ') || null;
  const theyWantYouHave = humanOverlapLine(match.bNeedsFromA, 'they');
  const youWantTheyHave = humanOverlapLine(match.aNeedsFromB, 'you');
  const matchWhy = [theyWantYouHave, youWantTheyHave].filter(Boolean).join(' ') || match.matchReasons[0] || '';

  return {
    id: `${userNode.nodeId}::${counterparty.nodeId}`,
    kind,
    whoWhat: counterparty.label,
    whyRelevant: match.matchReasons[0] || matchWhy,
    matchWhy,
    location,
    confidenceLabel:
      match.evidenceConfidence === 'STRONG'
        ? 'strong_fit'
        : match.evidenceConfidence === 'MODERATE'
          ? 'possible_fit'
          : null,
  };
}

async function defaultListCounterparties(): Promise<ListedGraphNode[]> {
  try {
    const listed = await launchpadPersistentMarketGraph.listNodes({ limit: 200 });
    return listed.items || [];
  } catch {
    return [];
  }
}

async function defaultLoadBusinessContext(
  userId: string,
  storeId?: string | null,
): Promise<GrowBusinessContext | null> {
  try {
    let resolvedStoreId = String(storeId || '').trim();
    if (resolvedStoreId) {
      const owned = await validateUserStoreId(userId, resolvedStoreId);
      if (!owned) resolvedStoreId = '';
    }
    if (!resolvedStoreId) {
      resolvedStoreId = (await tryAutoResolveSingleStoreId(userId)) || '';
    }
    if (!resolvedStoreId) return null;

    const stores = await fetchUserStoresForDisambiguation(userId);
    const store = stores.find((row) => String(row.id) === resolvedStoreId);
    if (!store) return null;
    return {
      storeId: resolvedStoreId,
      name: typeof store.name === 'string' ? store.name : null,
      type: typeof store.type === 'string' ? store.type : null,
      tagline: typeof store.tagline === 'string' ? store.tagline : null,
      country: typeof store.country === 'string' ? store.country : null,
      city: typeof store.city === 'string' ? store.city : null,
    };
  } catch {
    return null;
  }
}

function enrichAnalysisHas(
  analysis: MarketIntentAnalysis,
  context: GrowBusinessContext | null,
): { analysis: MarketIntentAnalysis; usedBusinessContext: boolean } {
  const merged = mergeBusinessContextIntoHas(analysis.has as HasWantsItem[], context);
  if (!merged.usedBusinessContext) {
    return { analysis, usedBusinessContext: false };
  }
  return {
    analysis: { ...analysis, has: merged.has },
    usedBusinessContext: true,
  };
}

function isSurfacedMatch(match: MarketMatch): boolean {
  if (match.reciprocalBand === 'CONTRADICTED' || match.reciprocalBand === 'INSUFFICIENT_EVIDENCE') {
    return false;
  }
  return (
    match.reciprocalBand === 'STRONG_RECIPROCAL' ||
    match.reciprocalBand === 'ONE_WAY_STRONG' ||
    match.reciprocalBand === 'POSSIBLE'
  );
}

const GUEST_PREVIEW_NEXT_ACTIONS: GrowNextAction[] = [
  { id: 'research_market' },
  { id: 'create_promotion' },
];

async function runSemanticUnderstanding(
  rawText: string,
  provenance: { ingestedBy: string; ingestChannel: string },
  tenantKey: string,
  deps: Pick<GrowAnalyzeDeps, 'llmGenerate' | 'forceRuleAssisted'>,
): Promise<{ analysis: MarketIntentAnalysis } | { failed: GrowAnalyzeResult } | { invalid: true }> {
  try {
    const ingest = await ingestMarketSignal(
      {
        rawText,
        sourceType: 'manual_entry',
        provenance: {
          permissionBasis: 'owner_submitted',
          ingestedBy: provenance.ingestedBy,
          ingestChannel: provenance.ingestChannel,
        },
      },
      {
        llmGenerate: deps.llmGenerate,
        forceRuleAssisted: deps.forceRuleAssisted,
        tenantKey,
      },
    );
    const analysis = ingest.analysis;
    if (analysis.outcome === 'SEMANTIC_RUNTIME_DEGRADED' || analysis.outcome === 'CLASSIFICATION_FAILED') {
      return { failed: failed('Cardbey could not understand that just now. Please try again.', true) };
    }
    if (analysis.outcome === 'INVALID_INPUT') {
      return { invalid: true };
    }
    return { analysis };
  } catch {
    return { failed: failed('Cardbey could not understand that just now. Please try again.', true) };
  }
}

/**
 * Guest-safe HAS/WANT understanding only.
 * Does not load account stores, scan the persistent graph, or persist opportunities.
 */
export async function previewGrowYourBusinessIntent(
  input: { rawText: string; locale?: string | null },
  deps: Pick<GrowAnalyzeDeps, 'llmGenerate' | 'forceRuleAssisted'> = {},
): Promise<GrowAnalyzeResult> {
  const rawText = String(input.rawText || '').trim();
  if (!rawText) {
    throw new GrowYourBusinessError('Describe what you have or what you are looking for.', 'invalid_input');
  }
  if (rawText.length > GROW_YOUR_BUSINESS_MAX_RAW_TEXT) {
    throw new GrowYourBusinessError('That description is too long.', 'invalid_input');
  }

  const semantic = await runSemanticUnderstanding(
    rawText,
    { ingestedBy: 'guest', ingestChannel: 'grow_your_business_guest_preview' },
    'guest',
    deps,
  );
  if ('invalid' in semantic) {
    throw new GrowYourBusinessError('Describe what you have or what you are looking for.', 'invalid_input');
  }
  if ('failed' in semantic) return { ...semantic.failed, guestPreview: true, opportunities: [] };

  const understanding = projectGrowUnderstanding(semantic.analysis, { usedBusinessContext: false });
  const clarification = resolveGrowClarification(semantic.analysis, understanding);
  if (clarification) {
    return {
      ok: true,
      status: 'needs_clarification',
      understanding: understanding.youHave.label || understanding.youWant.label ? understanding : null,
      clarification: { code: clarification },
      opportunities: [],
      nextActions: GUEST_PREVIEW_NEXT_ACTIONS,
      empty: true,
      retryable: false,
      error: null,
      guestPreview: true,
    };
  }

  return {
    ok: true,
    status: 'understood',
    understanding,
    clarification: null,
    opportunities: [],
    nextActions: GUEST_PREVIEW_NEXT_ACTIONS,
    empty: true,
    retryable: false,
    error: null,
    guestPreview: true,
  };
}

export async function analyzeGrowYourBusinessIntent(
  input: GrowAnalyzeInput,
  deps: GrowAnalyzeDeps = {},
): Promise<GrowAnalyzeResult> {
  const rawText = String(input.rawText || '').trim();
  if (!rawText) {
    throw new GrowYourBusinessError('Describe what you have or what you are looking for.', 'invalid_input');
  }
  if (rawText.length > GROW_YOUR_BUSINESS_MAX_RAW_TEXT) {
    throw new GrowYourBusinessError('That description is too long.', 'invalid_input');
  }

  const loadBusinessContext = deps.loadBusinessContext ?? defaultLoadBusinessContext;
  const listCounterparties = deps.listCounterparties ?? defaultListCounterparties;

  const semantic = await runSemanticUnderstanding(
    rawText,
    { ingestedBy: input.userId, ingestChannel: 'grow_your_business_v1' },
    input.userId,
    deps,
  );
  if ('invalid' in semantic) {
    throw new GrowYourBusinessError('Describe what you have or what you are looking for.', 'invalid_input');
  }
  if ('failed' in semantic) return semantic.failed;

  const analysis = semantic.analysis;
  const businessContext = await loadBusinessContext(input.userId, input.storeId);
  const enriched = enrichAnalysisHas(analysis, businessContext);
  const understanding = projectGrowUnderstanding(enriched.analysis, {
    usedBusinessContext: enriched.usedBusinessContext,
  });
  const clarification = resolveGrowClarification(enriched.analysis, understanding);

  if (clarification) {
    return {
      ok: true,
      status: 'needs_clarification',
      understanding: understanding.youHave.label || understanding.youWant.label ? understanding : null,
      clarification: { code: clarification },
      opportunities: [],
      nextActions: IMPLEMENTED_NEXT_ACTIONS,
      empty: true,
      retryable: false,
      error: null,
    };
  }

  const userNode = projectMarketGraphNode({
    nodeId: `growth:${input.userId}:${enriched.analysis.signalId}`,
    label: understanding.youHave.label || 'Your business',
    analysis: enriched.analysis,
  });

  let counterparties: ListedGraphNode[] = [];
  try {
    counterparties = await listCounterparties();
  } catch {
    counterparties = [];
  }

  const opportunities: GrowOpportunity[] = [];
  for (const other of counterparties) {
    if (other.nodeId === userNode.nodeId) continue;
    const eligibility = isEligibleMatchPair(userNode, other);
    if (!eligibility.eligible) continue;
    const match = evaluateReciprocalMatchPair(userNode, other);
    if (!isSurfacedMatch(match)) continue;
    opportunities.push(toOpportunity(userNode, other, match));
  }

  const empty = opportunities.length === 0;
  return {
    ok: true,
    status: 'understood',
    understanding,
    clarification: null,
    opportunities,
    nextActions: IMPLEMENTED_NEXT_ACTIONS,
    empty,
    retryable: false,
    error: null,
  };
}

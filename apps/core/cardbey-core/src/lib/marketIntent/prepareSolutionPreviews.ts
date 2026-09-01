import { buildSeedStorePreview } from '../businessIngestion/SeedStoreBuilder.js';
import type { MarketIntentAnalysis } from './types.js';
import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import type { ProposedCardbeySolution, SolutionPreviewArtifact } from './briefTypes.js';
import { isPreviewEligible } from './determinePreparationLevel.js';
import type { FitBand } from './opportunityTypes.js';

import type { MarketOpportunityResearch } from './buildMarketOpportunityResearch.js';

/**
 * Create in-memory preview artifacts only — no DB writes, no publish, no outreach.
 */
export function prepareSolutionPreviews(params: {
  solution: ProposedCardbeySolution;
  analysis: MarketIntentAnalysis;
  resolved: ResolvedMarketEntity;
  research: MarketEntityResearch | null;
  fitBand: FitBand;
  preparationLevel: number;
  marketOpportunityResearch?: MarketOpportunityResearch | null;
}): SolutionPreviewArtifact[] {
  if (!isPreviewEligible(params.preparationLevel as 0 | 1 | 2 | 3, params.fitBand)) {
    return [];
  }

  const previews: SolutionPreviewArtifact[] = [];
  const businessName =
    params.resolved.canonicalName ??
    params.research?.businessIdentity ??
    params.analysis.businessHint ??
    'Prospect Business';

  const category =
    params.research?.offerings?.[0]?.name ??
    params.analysis.has.find((h) => h.type === 'PRODUCT' || h.type === 'BUSINESS')?.label ??
    'general';

  const hasStoreCapability = params.solution.capabilityIds.some((id) =>
    ['create_store', 'structured_store_build', 'generate_mini_website'].includes(id),
  );

  if (hasStoreCapability) {
    const storePreview = buildSeedStorePreview({
      businessName,
      businessType: String(category).slice(0, 80),
      address: params.resolved.location ?? params.analysis.locationHint ?? undefined,
      phone: params.research?.publicContacts?.find((c) => c.type === 'phone')?.value,
      website: params.resolved.website ?? params.research?.digitalPresence?.website ?? undefined,
      email: params.research?.publicContacts?.find((c) => c.type === 'email')?.value,
      region: params.research?.geographies?.[0],
      country: params.research?.geographies?.[0],
      state: undefined,
      city: undefined,
      owner: null,
      claimable: true,
      publicVisibility: 'limited',
      provenance: 'market_intent_g4_preview',
      sourceType: 'market_intent',
      sourceReference: params.solution.signalId,
      sourceRowId: params.solution.solutionId,
      ingestedAt: new Date().toISOString(),
      qualityScore: Math.round(params.solution.confidence * 100),
      confidenceScore: params.solution.confidence,
      verificationStatus: 'review_required',
      registrationNumber: null,
    });

  previews.push({
      type: 'store_presentation_preview',
      capabilityId: 'create_store',
      label: 'Australian-facing business presentation preview',
      preview: storePreview as Record<string, unknown>,
      limitations: [
        'In-memory preview only — not persisted or published',
        'Requires human review and prospect onboarding before any live store',
      ],
    });
  }

  if (params.solution.capabilityIds.includes('market_research')) {
    const researchLabel = params.marketOpportunityResearch?.displayLabel;
    const label =
      researchLabel && researchLabel !== 'Market Research'
        ? `Market Research — ${researchLabel}`
        : 'Market Research';
    const targetMarket =
      params.marketOpportunityResearch?.objective.researchGeography ??
      params.analysis.wants.find((w) => /australia|market|vietnam|nationwide/i.test(w.label))?.label ??
      params.analysis.locationHint ??
      'target market';
    const researchQuestions =
      params.marketOpportunityResearch?.entryOrExpansionConsiderations ??
      [
        `Who are likely buyers or partners for ${businessName} in ${targetMarket}?`,
        'What positioning and compliance considerations apply?',
        'Which channels should an initial presence prioritize?',
      ];

    previews.push({
      type: 'market_entry_outline',
      capabilityId: 'market_research',
      label,
      preview: {
        targetMarket,
        objective: params.marketOpportunityResearch?.objective.objectiveType ?? params.solution.objective,
        researchObjective: params.marketOpportunityResearch?.displayLabel ?? null,
        counterpartyTypes: params.marketOpportunityResearch?.counterparties ?? [],
        researchDepth: params.marketOpportunityResearch?.objective.researchDepth ?? 1,
        researchQuestions,
        dataSources: ['Existing G2 research', 'Public business signals', 'G1 intent analysis'],
        escalationNote: 'Full LLM market research not triggered in G4 — use existing G2 evidence first',
      },
      limitations: ['Outline only — not a full market report'],
    });
  }

  if (params.solution.capabilityIds.includes('create_promotion')) {
    previews.push({
      type: 'promotion_concept',
      capabilityId: 'create_promotion',
      label: 'Promotion concept outline',
      preview: {
        headline: `${businessName}: ${params.solution.objective}`,
        angle: params.analysis.intents.primary ?? 'growth',
        channels: ['social', 'landing presentation'],
        cta: 'Learn more / enquire',
        status: 'concept_only',
      },
      limitations: ['Concept outline only — no creative generation or publishing in G4'],
    });
  }

  return previews;
}

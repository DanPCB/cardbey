import type { ResolvedMarketEntity, MarketEntityResearch } from './entityTypes.js';
import { mapBusinessResearchToMarketEntityResearch } from './mapResearchResult.js';
import { shouldProceedToResearch } from './buildResolvedMarketEntity.js';

export type RunMarketResearchFn = (input: {
  businessName: string;
  location?: string | null;
  website?: string | null;
  phone?: string | null;
  category?: string | null;
}) => Promise<Record<string, unknown>>;

async function defaultRunResearch(
  input: {
    businessName: string;
    location?: string | null;
    website?: string | null;
    phone?: string | null;
    category?: string | null;
  },
  options: { skipNetwork?: boolean } = {},
): Promise<Record<string, unknown>> {
  const { runStoreCreationResearch } = await import('../storeCreationResearch/businessResearchAgent.js');
  const result = await runStoreCreationResearch(
    {
      businessName: input.businessName,
      location: input.location ?? undefined,
      website: input.website ?? undefined,
      phone: input.phone ?? undefined,
      category: input.category ?? undefined,
      // Explicitly no draftId / missionId — no store creation side effects
      draftId: undefined,
      missionId: undefined,
    },
    {
      skipNetwork: options.skipNetwork,
      skipStoreResearchPipeline: true,
      prisma: undefined,
    },
  );
  return result as Record<string, unknown>;
}

export type RunMarketEntityResearchOptions = {
  skipNetwork?: boolean;
  runResearch?: RunMarketResearchFn;
  category?: string | null;
};

/**
 * Governed business research for resolved BUSINESS entities.
 * Reuses businessResearchAgent.js without store/onboarding framing.
 */
export async function runMarketEntityResearch(
  resolved: ResolvedMarketEntity,
  options: RunMarketEntityResearchOptions = {},
): Promise<MarketEntityResearch> {
  if (!shouldProceedToResearch(resolved.entityKind, resolved.resolutionStatus)) {
    return {
      signalId: resolved.signalId,
      resolvedEntityRef: resolved.resolvedEntityRef,
      offerings: [],
      capabilities: [],
      geographies: [],
      customerSegments: [],
      digitalPresence: { website: resolved.website, socialProfiles: resolved.socialProfiles },
      publicContacts: [],
      evidence: resolved.evidence,
      confidence: 0,
      researchStatus: 'NOT_APPLICABLE',
      limitations: ['Research not applicable for entity kind or resolution status'],
      researchedAt: new Date().toISOString(),
    };
  }

  const businessName = resolved.canonicalName;
  if (!businessName) {
    return {
      signalId: resolved.signalId,
      resolvedEntityRef: resolved.resolvedEntityRef,
      offerings: [],
      capabilities: [],
      geographies: [],
      customerSegments: [],
      digitalPresence: { website: null, socialProfiles: [] },
      publicContacts: [],
      evidence: resolved.evidence,
      confidence: 0,
      researchStatus: 'INSUFFICIENT_EVIDENCE',
      limitations: ['No canonical business name for research'],
      researchedAt: new Date().toISOString(),
    };
  }

  try {
    const runFn = options.runResearch ?? defaultRunResearch;
    const raw = await runFn(
      {
        businessName,
        location: resolved.location,
        website: resolved.website,
        phone: resolved.candidateEntities[0]?.phone ?? null,
        category: options.category ?? null,
      },
      { skipNetwork: options.skipNetwork },
    );

    const { loadResearchEvidence } = await import('../storeCreationResearch/researchEvidenceRepository.js');
    const cacheKey = loadResearchEvidence({
      businessName,
      website: resolved.website ?? undefined,
      location: resolved.location ?? undefined,
    })
      ? `${businessName}|${resolved.website ?? ''}`
      : null;

    return mapBusinessResearchToMarketEntityResearch(resolved, raw, cacheKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      signalId: resolved.signalId,
      resolvedEntityRef: resolved.resolvedEntityRef,
      offerings: [],
      capabilities: [],
      geographies: [],
      customerSegments: [],
      digitalPresence: { website: resolved.website, socialProfiles: resolved.socialProfiles },
      publicContacts: [],
      evidence: resolved.evidence,
      confidence: 0,
      researchStatus: 'FAILED',
      limitations: [`Research failed: ${message}`],
      researchedAt: new Date().toISOString(),
    };
  }
}

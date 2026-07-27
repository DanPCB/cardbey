import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isExistingBusinessIntent, resolveBusinessEntity } from '../businessEntityResolver.js';
import { classifySourceAuthority } from '../sourceDiscoveryService.js';
import { reconcileBusinessEvidence } from '../businessEvidenceReconciler.js';
import { buildStoreResearchReviewArtifact, canPersistStoreDraftFromResearch } from '../ownerReviewArtifact.js';
import { markSuggestedCatalogItems } from '../catalogNormalizers/index.js';
import { buildStoreCreationMissionContract } from '../missionContract.js';
import { isStoreResearchPipelineEnabled } from '../runStoreResearchPipeline.js';

vi.mock('../../businessDiscovery/businessDiscoverySources.js', () => ({
  searchGooglePlaces: vi.fn(),
  fetchGooglePlaceDetails: vi.fn(),
  isGooglePlacesConfigured: vi.fn(() => false),
}));

describe('storeResearch pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies existing business intent when name + location provided', () => {
    expect(
      isExistingBusinessIntent({ businessName: 'French Baguette', location: 'Footscray VIC' }),
    ).toBe(true);
    expect(isExistingBusinessIntent({ businessName: 'CA Handyman' })).toBe(false);
  });

  it('never auto-selects without candidates', async () => {
    const result = await resolveBusinessEntity({
      businessName: 'CA Handyman',
    });
    expect(result.candidates).toEqual([]);
    expect(result.selectedCandidate).toBeUndefined();
    expect(result.requiresOwnerConfirmation).toBe(true);
  });

  it('classifies official website as owner_controlled authority', () => {
    expect(classifySourceAuthority({ sourceType: 'official_website' })).toBe('owner_controlled');
    expect(classifySourceAuthority({ sourceType: 'google_business' })).toBe('authoritative_structured');
    expect(classifySourceAuthority({ sourceType: 'review_site' })).toBe('unverified');
  });

  it('labels suggested catalog items distinctly from sourced', () => {
    const suggested = markSuggestedCatalogItems([{ name: 'Door Repair', price: 120 }]);
    expect(suggested[0].contentOrigin).toBe('suggested');
    expect(suggested[0].status).toBe('suggested');
  });

  it('reconciles provider results with conflict status', () => {
    const { evidence } = reconcileBusinessEvidence({
      providerResults: [
        {
          providerId: 'google_places',
          providerName: 'Google Places',
          tier: 2,
          confidence: 0.8,
          sourceType: 'google_business',
          businessFacts: { businessName: 'French Baguette' },
          catalogItems: [{ name: 'Sourdough', price: 9.5 }],
          sourceEvidence: [],
        },
      ],
    });
    expect(evidence.profile.businessName.contentOrigin).toBe('sourced');
    expect(evidence.catalogItems[0].name).toBe('Sourdough');
  });

  it('blocks persist before owner confirmation when review required', () => {
    const artifact = buildStoreResearchReviewArtifact({
      missionId: 'm1',
      entityResolution: {
        candidates: [{ entityId: 'a', name: 'Test', confidence: 0.5, matchReasons: [], source: 'google_places' }],
        confidence: 0.5,
        requiresOwnerConfirmation: true,
        resolutionNotes: [],
      },
    });
    expect(canPersistStoreDraftFromResearch(artifact, false)).toBe(false);
    expect(canPersistStoreDraftFromResearch(artifact, true)).toBe(true);
  });

  it('builds mission contract with content policy flags', () => {
    const contract = buildStoreCreationMissionContract({
      evidenceId: 'ev1',
      approvedSources: ['src1'],
      executionContext: { missionId: 'm1' },
      contentPolicy: { sourcedFieldsApproved: true, suggestedFieldsApproved: false },
    });
    expect(contract.family).toBe('store_creation');
    expect(contract.contentPolicy.sourcedFieldsApproved).toBe(true);
    expect(contract.expectedArtifacts).toEqual(['store_draft']);
  });

  it('pipeline flag defaults off in production env when unset', () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.ENABLE_STORE_RESEARCH_PIPELINE;
    delete process.env.ENABLE_STORE_RESEARCH_PIPELINE;
    process.env.NODE_ENV = 'production';
    expect(isStoreResearchPipelineEnabled()).toBe(false);
    process.env.NODE_ENV = prev;
    if (prevFlag === undefined) delete process.env.ENABLE_STORE_RESEARCH_PIPELINE;
    else process.env.ENABLE_STORE_RESEARCH_PIPELINE = prevFlag;
  });

  it('does not recurse pipeline into legacy research (French Baguette no-match path)', async () => {
    const discoverSources = vi.fn(async () => []);
    vi.doMock('../../storeCreationResearch/sourceDiscoveryService.js', () => ({
      discoverSources,
    }));

    vi.resetModules();
    const { runStoreCreationResearch } = await import('../../storeCreationResearch/businessResearchAgent.js');

    const result = await runStoreCreationResearch(
      {
        businessName: 'French Baguette',
        location: 'Footscray VIC',
        category: 'Food & drink',
      },
      { skipNetwork: false },
    );

    expect(discoverSources).toHaveBeenCalledTimes(1);
    expect(result.fallbackToGenerated).toBe(true);
    expect(result.researchRan).toBe(true);

    vi.doUnmock('../../storeCreationResearch/sourceDiscoveryService.js');
    vi.resetModules();
  });
});

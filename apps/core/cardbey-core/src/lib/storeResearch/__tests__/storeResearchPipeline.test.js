import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isExistingBusinessIntent, resolveBusinessEntity, unwrapPlacesSearchRow } from '../businessEntityResolver.js';
import { classifySourceAuthority } from '../sourceDiscoveryService.js';
import { reconcileBusinessEvidence } from '../businessEvidenceReconciler.js';
import { buildStoreResearchReviewArtifact, canPersistStoreDraftFromResearch } from '../ownerReviewArtifact.js';
import { markSuggestedCatalogItems } from '../catalogNormalizers/index.js';
import { buildStoreCreationMissionContract } from '../missionContract.js';
import { isStoreResearchPipelineEnabled } from '../runStoreResearchPipeline.js';
import {
  searchGooglePlaces,
  isGooglePlacesConfigured,
} from '../../businessDiscovery/businessDiscoverySources.js';

vi.mock('../../businessDiscovery/businessDiscoverySources.js', () => ({
  searchGooglePlaces: vi.fn(),
  fetchGooglePlaceDetails: vi.fn(async (placeId) => {
    if (String(placeId).includes('wrong-florist')) {
      return {
        placeId,
        name: 'Florist Braybrook - Same Day Flower Delivery',
        businessName: 'Florist Braybrook - Same Day Flower Delivery',
        website: 'https://floristbraybrook.example',
        address: 'Braybrook VIC',
      };
    }
    return {
      placeId,
      name: 'MODERN SECURITY DOORS',
      businessName: 'MODERN SECURITY DOORS',
      website: 'http://modernsecuritydoors.com.au',
      address: 'Unit 54/68 Eucumbene Dr, Ravenhall VIC 3023, Australia',
    };
  }),
  isGooglePlacesConfigured: vi.fn(() => false),
  getGooglePlacesApiMode: vi.fn(() => 'disabled'),
}));

describe('storeResearch pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGooglePlacesConfigured.mockReturnValue(false);
    searchGooglePlaces.mockResolvedValue([]);
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

  it('unwraps Places { source, attribution, raw } rows for identity matching', async () => {
    const wrapped = {
      source: 'google_places',
      attribution: { sourceUrl: 'https://maps.google.com/?cid=1' },
      raw: {
        name: 'MODERN SECURITY DOORS',
        businessName: 'MODERN SECURITY DOORS',
        address: 'Unit 54/68 Eucumbene Dr, Ravenhall VIC 3023, Australia',
        location: 'Unit 54/68 Eucumbene Dr, Ravenhall VIC 3023, Australia',
        website: 'http://modernsecuritydoors.com.au',
        placeId: 'ChIJ-msd-test',
        sourceId: 'ChIJ-msd-test',
      },
    };
    expect(unwrapPlacesSearchRow(wrapped).placeId).toBe('ChIJ-msd-test');

    isGooglePlacesConfigured.mockReturnValue(true);
    searchGooglePlaces.mockResolvedValue([wrapped]);

    const result = await resolveBusinessEntity({
      businessName: 'Modern Security Doors',
      location: 'Ravenhall VIC 3023',
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].placeId).toBe('ChIJ-msd-test');
    expect(result.candidates[0].website).toMatch(/modernsecuritydoors/i);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.45);
  });

  it('does not soft-select Florist Braybrook for My Flower (industry-only overlap)', async () => {
    isGooglePlacesConfigured.mockReturnValue(true);
    searchGooglePlaces.mockResolvedValue([
      {
        source: 'google_places',
        attribution: {},
        raw: {
          name: 'Florist Braybrook - Same Day Flower Delivery',
          businessName: 'Florist Braybrook - Same Day Flower Delivery',
          address: 'Braybrook VIC',
          website: 'https://floristbraybrook.example',
          placeId: 'ChIJ-wrong-florist',
        },
      },
    ]);

    const result = await resolveBusinessEntity({
      businessName: 'My Flower',
      location: 'Melbourne',
    });
    expect(result.candidates.length).toBeGreaterThanOrEqual(0);
    expect(result.selectedCandidate).toBeUndefined();
  });

  it('pipeline refuses candidates[0] fallback when entity not soft-selected', async () => {
    isGooglePlacesConfigured.mockReturnValue(true);
    searchGooglePlaces.mockResolvedValue([
      {
        source: 'google_places',
        attribution: {},
        raw: {
          name: 'Florist Braybrook - Same Day Flower Delivery',
          businessName: 'Florist Braybrook - Same Day Flower Delivery',
          address: 'Braybrook VIC',
          website: 'https://floristbraybrook.example',
          placeId: 'ChIJ-wrong-florist',
        },
      },
    ]);

    vi.resetModules();
    const { runStoreResearchPipeline } = await import('../runStoreResearchPipeline.js');
    const result = await runStoreResearchPipeline(
      {
        businessName: 'My Flower',
        location: 'Melbourne',
        category: 'Home & Garden',
      },
      { skipNetwork: true },
    );
    expect(result.mode).toBe('new_business');
    expect(result.fallbackToGenerated).toBe(true);
    const selected = result.entityResolution?.selectedCandidate;
    expect(selected).toBeFalsy();
    const notes = (result.entityResolution?.resolutionNotes ?? []).join(' ');
    const logs = (result.logs ?? []).map(String).join(' ');
    expect(
      notes.includes('refused candidates[0]') ||
        logs.includes('no_defensible_entity_select_fallback_new') ||
        logs.includes('no_entity_match_fallback_new'),
    ).toBe(true);
    vi.resetModules();
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

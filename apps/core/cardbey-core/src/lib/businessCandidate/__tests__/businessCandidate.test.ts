import { describe, expect, it, beforeEach } from 'vitest';
import {
  canTransitionCandidateStatus,
  transitionCandidateStatus,
} from '../candidateLifecycle.js';
import { crmStageFromStatus, pipelineStageFromStatus, countByPipelineStage } from '../crmOverlay.js';
import {
  findUnreplacedDemoViolations,
  assertPublishableNoDemoContent,
  provenanceForSource,
} from '../contentProvenance.js';
import type { BusinessCandidateRecord } from '../types.js';
import { resetBusinessCandidatesForTests } from '../candidateRepository.js';

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-1',
    batchId: 'MELBOURNE_BATCH001_20260627',
    campaignId: 'cardbey-batch-001-melbourne-west',
    name: 'ABC Bakery',
    businessType: 'bakery',
    address: '1 Main St',
    suburb: 'Footscray',
    city: 'Footscray',
    state: 'VIC',
    postcode: '3011',
    country: 'AU',
    phone: '+61400000000',
    website: 'https://abc.example',
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'osm',
    confidenceScore: 0.8,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: ['logo'],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: null,
    sourceUrl: 'https://abc.example',
    rawSourceJson: null,
    seedId: null,
    status: 'DISCOVERED',
    dedupeKey: 'abc|phone|addr|footscray',
    discoveryProviderId: 'osm',
    externalId: 'ext-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('candidateLifecycle', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
  });

  it('allows DISCOVERED → FETCHING → READY_FOR_REVIEW', () => {
    expect(canTransitionCandidateStatus('DISCOVERED', 'FETCHING')).toBe(true);
    expect(canTransitionCandidateStatus('FETCHING', 'READY_FOR_REVIEW')).toBe(true);
    expect(canTransitionCandidateStatus('DISCOVERED', 'PUBLISHED')).toBe(false);
  });

  it('persists status transition with audit trail', async () => {
    const candidate = sampleCandidate();
    const { saveBusinessCandidate } = await import('../candidateRepository.js');
    await saveBusinessCandidate(candidate);

    const updated = await transitionCandidateStatus({
      candidate,
      toStatus: 'FETCHING',
      action: 'business_fetched',
      actorType: 'performer',
    });

    expect(updated.status).toBe('FETCHING');
    const { listCandidateTransitions } = await import('../candidateRepository.js');
    const transitions = await listCandidateTransitions(candidate.id);
    expect(transitions[0]?.action).toBe('business_fetched');
  });
});

describe('crmOverlay', () => {
  it('derives CRM from runtime status without independent storage', () => {
    expect(crmStageFromStatus('OWNER_CONTACTED')).toBe('contacted');
    expect(crmStageFromStatus('OWNER_REVIEW')).toBe('owner_reviewing');
    expect(pipelineStageFromStatus('STORE_DRAFT_READY')).toBe('store_draft');
  });

  it('aggregates pipeline counts from status histogram', () => {
    const pipeline = countByPipelineStage({
      DISCOVERED: 10,
      FETCHING: 5,
      OWNER_REVIEW: 3,
      PUBLISHED: 2,
    });
    expect(pipeline.discovery).toBe(10);
    expect(pipeline.reasoning).toBe(5);
    expect(pipeline.owner_review).toBe(3);
    expect(pipeline.published).toBe(2);
  });
});

describe('contentProvenance', () => {
  it('marks AI-generated content as demo requiring replacement', () => {
    const prov = provenanceForSource('AI_GENERATED', { demoReason: 'placeholder hero' });
    expect(prov.isDemo).toBe(true);
    expect(prov.needsReplacement).toBe(true);
  });

  it('blocks publish when demo products remain', () => {
    const violations = findUnreplacedDemoViolations({
      products: [
        {
          name: 'Demo Croissant',
          provenance: provenanceForSource('AI_GENERATED'),
        },
      ],
    });
    expect(violations).toHaveLength(1);

    expect(() =>
      assertPublishableNoDemoContent({
        products: [{ name: 'Demo Croissant', provenance: provenanceForSource('AI_GENERATED') }],
      }),
    ).toThrow(/Cannot publish/);
  });

  it('allows publish when demo content is replaced', () => {
    expect(() =>
      assertPublishableNoDemoContent({
        products: [
          {
            name: 'Real Croissant',
            provenance: {
              source: 'USER_UPLOADED',
              isDemo: false,
              needsReplacement: false,
              replacementStatus: 'replaced',
            },
          },
        ],
      }),
    ).not.toThrow();
  });
});

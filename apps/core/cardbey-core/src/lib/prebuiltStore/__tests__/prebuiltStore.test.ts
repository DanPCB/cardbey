import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BusinessCandidateRecord } from '../../businessCandidate/types.js';
import {
  resetBusinessCandidatesForTests,
  saveBusinessCandidate,
} from '../../businessCandidate/candidateRepository.js';
import {
  getPrebuiltDraftById,
  resetPrebuiltStoreDataForTests,
  savePrebuiltDraft,
} from '../draftRepository.js';
import {
  confirmAndConvert,
  initiateClaim,
  verifyClaimAuthority,
} from '../claimConversionService.js';
import {
  assertConversionAllowed,
  buildConversionPlan,
  generateDraftFromCandidate,
} from '../prebuiltDraftService.js';
import {
  createPreviewToken,
  getPreviewTokenRecord,
  revokePreviewToken,
} from '../previewTokenService.js';

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-prebuilt-1',
    batchId: 'MM_AU_VIC_FOOD_TEST',
    campaignId: null,
    name: 'North Market Deli',
    businessType: 'deli',
    address: '88 Market Rd',
    suburb: 'Brunswick',
    city: 'Melbourne',
    state: 'VIC',
    postcode: '3056',
    country: 'AU',
    phone: '+61391111111',
    website: 'https://north-market-deli.example',
    email: null,
    socialLinks: [{ platform: 'facebook', url: 'https://facebook.com/northmarketdeli' }],
    coordinates: { lat: -37.76, lng: 144.96 },
    discoveredFrom: 'osm',
    confidenceScore: 0.88,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [{ name: 'Catering trays', description: 'Prepared platters for events.' }],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: null,
    sourceUrl: 'https://north-market-deli.example',
    rawSourceJson: null,
    seedId: 'seed-prebuilt-1',
    status: 'CLAIMABLE',
    dedupeKey: 'north-market-deli|market-rd|brunswick',
    discoveryProviderId: 'osm',
    externalId: 'ext-prebuilt-1',
    createdAt: now,
    updatedAt: now,
    description: 'Neighbourhood deli with sandwiches, grocery staples, and catering.',
    category: 'Food & Drink',
    openingHours: 'Daily 8:00-18:00',
    heroImageUrl: 'https://img.example/deli.jpg',
    heroImageSource: 'candidate.heroImageUrl',
    ...overrides,
  };
}

describe('prebuiltStore foundation', () => {
  let tmpRoot: string;
  const prevDraftDir = process.env.PREBUILT_STORE_DIR;
  const prevCandidateDir = process.env.BUSINESS_CANDIDATE_DIR;
  const prevFlag = process.env.ENABLE_MULTI_MARKET_PREBUILT_STORE_V1;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'prebuilt-store-'));
    process.env.PREBUILT_STORE_DIR = path.join(tmpRoot, 'prebuiltStores');
    process.env.BUSINESS_CANDIDATE_DIR = path.join(tmpRoot, 'businessCandidates');
    process.env.NODE_ENV = 'test';
    delete process.env.ENABLE_MULTI_MARKET_PREBUILT_STORE_V1;
    await resetPrebuiltStoreDataForTests();
    await resetBusinessCandidatesForTests();
  });

  afterEach(async () => {
    if (prevDraftDir === undefined) delete process.env.PREBUILT_STORE_DIR;
    else process.env.PREBUILT_STORE_DIR = prevDraftDir;
    if (prevCandidateDir === undefined) delete process.env.BUSINESS_CANDIDATE_DIR;
    else process.env.BUSINESS_CANDIDATE_DIR = prevCandidateDir;
    if (prevFlag === undefined) delete process.env.ENABLE_MULTI_MARKET_PREBUILT_STORE_V1;
    else process.env.ENABLE_MULTI_MARKET_PREBUILT_STORE_V1 = prevFlag;
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  it('marks hidden candidates as excluded from public feed drafts', async () => {
    const draft = await generateDraftFromCandidate(
      sampleCandidate({ status: 'HIDDEN_BY_OPERATOR', operatorVisibility: 'hidden' }),
      { allowAiSuggestions: false },
    );

    expect(draft.publicFeedExcluded).toBe(true);
  });

  it('expires and revokes preview tokens by opaque token only', async () => {
    const draft = await generateDraftFromCandidate(sampleCandidate(), { allowAiSuggestions: false });

    const expiring = await createPreviewToken({ draftId: draft.id, ttlMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await getPreviewTokenRecord(expiring.token)).toBeNull();

    const active = await createPreviewToken({ draftId: draft.id, ttlMs: 5_000 });
    expect(await getPreviewTokenRecord(active.token)).not.toBeNull();
    await revokePreviewToken(active.token);
    expect(await getPreviewTokenRecord(active.token)).toBeNull();
  });

  it('tracks evidence classes and blocks unaccepted AI suggestions', async () => {
    const candidate = sampleCandidate();
    const draft = await generateDraftFromCandidate(candidate, { allowAiSuggestions: true });

    expect(draft.fieldEvidence.some((row) => row.evidenceClass === 'SOURCE_CONFIRMED')).toBe(true);
    expect(draft.offerings.some((row) => row.evidenceClass === 'AI_SUGGESTED')).toBe(true);

    expect(() =>
      assertConversionAllowed({
        draft,
        candidate,
        claimVerified: true,
      }),
    ).toThrow(/owner acceptance/i);

    const acceptedDraft = {
      ...draft,
      offerings: draft.offerings.map((row) =>
        row.evidenceClass === 'AI_SUGGESTED' ? { ...row, ownerAccepted: true, included: true } : row,
      ),
    };

    const plan = buildConversionPlan({
      draft: acceptedDraft,
      candidate,
      claimVerified: true,
    });

    expect(plan.acceptedOfferings.length).toBeGreaterThan(0);
    expect(plan.acceptedOfferings.some((row) => row.source === 'ai_suggestion_stub')).toBe(true);
  });

  it('guards conversion when candidate already has a store', async () => {
    const candidate = sampleCandidate({ id: 'cand-existing-store', storeId: 'store-live-1' });
    const draft = await generateDraftFromCandidate(candidate, { allowAiSuggestions: false });

    expect(draft.status).toBe('BLOCKED');
    expect(() =>
      assertConversionAllowed({
        draft,
        candidate,
        claimVerified: true,
      }),
    ).toThrow(/already linked to a canonical store/i);
  });

  it('stubs claim verification and conversion, blocks duplicate claimants, and is idempotent', async () => {
    const candidate = sampleCandidate({ id: 'cand-convert-1' });
    await saveBusinessCandidate(candidate);

    const generated = await generateDraftFromCandidate(candidate, { allowAiSuggestions: true });
    const readyDraft = {
      ...generated,
      offerings: generated.offerings.map((row) =>
        row.evidenceClass === 'AI_SUGGESTED' ? { ...row, ownerAccepted: true, included: true } : row,
      ),
    };
    await savePrebuiltDraft(readyDraft);

    const { claimToken } = await initiateClaim({ candidateId: candidate.id });
    const verified = await verifyClaimAuthority({
      claimToken,
      claimantId: 'owner-1',
      proofType: 'document',
    });
    expect(verified.verified).toBe(true);

    const converted = await confirmAndConvert({
      claimToken,
      claimantId: 'owner-1',
    });
    expect(converted.ok).toBe(true);
    expect(converted.alreadyConverted).toBe(false);
    expect(converted.plan?.candidateId).toBe(candidate.id);

    const secondPass = await confirmAndConvert({
      claimToken,
      claimantId: 'owner-1',
    });
    expect(secondPass.alreadyConverted).toBe(true);

    const persistedDraft = await getPrebuiltDraftById(readyDraft.id);
    expect(persistedDraft?.status).toBe('CONVERTED');

    const duplicateClaim = await initiateClaim({ candidateId: candidate.id });
    await verifyClaimAuthority({
      claimToken: duplicateClaim.claimToken,
      claimantId: 'owner-2',
      proofType: 'manual_review',
    });

    await expect(
      confirmAndConvert({
        claimToken: duplicateClaim.claimToken,
        claimantId: 'owner-2',
      }),
    ).rejects.toThrow(/already verified or converted/i);
  });

  it('documents caller-side feature checks via env mocks', () => {
    const callerAllowsFoundation = () =>
      String(process.env.ENABLE_MULTI_MARKET_PREBUILT_STORE_V1 ?? '').trim().toLowerCase() === 'true';

    expect(callerAllowsFoundation()).toBe(false);
    process.env.ENABLE_MULTI_MARKET_PREBUILT_STORE_V1 = 'true';
    expect(callerAllowsFoundation()).toBe(true);
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import {
  categoryAllowsAsset,
  categoryRepresentativeHeroUrl,
  isFoodCategoryKey,
  resolvePilotCategoryKey,
} from '../media/categoryMediaVocabulary.js';
import { selectBestCandidateMedia } from '../media/selectBestCandidateMedia.js';
import { runMediaDiscoveryForCandidate } from '../media/mediaDiscoveryAgent.js';
import { generateBusinessIntelligenceBrief } from '../brief/generateBusinessIntelligenceBrief.js';
import { recordBriefDownloadIntent, recordClaimButtonIntent } from '../brief/briefService.js';
import { resetBusinessCandidatesForTests, saveBusinessCandidate } from '../candidateRepository.js';
import { resetMediaEvidenceForTests } from '../media/mediaEvidenceRepository.js';
import { resetBriefsForTests } from '../brief/briefRepository.js';
import { resetClaimIntentsForTests, listClaimIntents } from '../claimIntent/claimIntentRepository.js';
import { isProtectedBatch0 } from '../batch001Config.js';
import type { BusinessCandidateRecord } from '../types.js';

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: `cand-${Math.random().toString(36).slice(2, 9)}`,
    batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
    campaignId: 'cardbey-batch-001-melbourne-west',
    name: 'Test Business',
    businessType: 'bakery',
    address: '1 Main St',
    suburb: 'Footscray',
    city: 'Footscray',
    state: 'VIC',
    postcode: '3011',
    country: 'AU',
    phone: '+61400000000',
    website: 'https://test.example',
    email: null,
    socialLinks: [],
    coordinates: { lat: -37.8, lng: 144.9 },
    discoveredFrom: 'osm',
    confidenceScore: 0.82,
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
    placeId: 'place-1',
    sourceUrl: 'https://maps.example/photo',
    rawSourceJson: { photos: [{ photo_reference: 'ref-1' }] },
    seedId: 'seed-test-1',
    status: 'CLAIMABLE',
    dedupeKey: `dedupe-${Math.random().toString(36).slice(2, 9)}`,
    discoveryProviderId: 'google_places',
    externalId: 'ext-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('category media vocabulary', () => {
  it('bakery does not receive restaurant/steak fallback', () => {
    const bakeryUrl = categoryRepresentativeHeroUrl('bakery');
    const restaurantUrl = categoryRepresentativeHeroUrl('restaurant');
    const nailUrl = categoryRepresentativeHeroUrl('nail_salon');
    expect(bakeryUrl).not.toBe(restaurantUrl);
    expect(bakeryUrl).not.toBe(nailUrl);
    expect(resolvePilotCategoryKey('nail salon')).toBe('nail_salon');
    expect(isFoodCategoryKey('nail_salon')).toBe(false);
  });

  it('nail salon does not receive food fallback', () => {
    expect(categoryAllowsAsset('nail_salon', 'restaurant')).toBe(false);
    expect(categoryAllowsAsset('nail_salon', 'nail_salon')).toBe(true);
    const nailUrl = categoryRepresentativeHeroUrl('nail_salon');
    const foodUrl = categoryRepresentativeHeroUrl('restaurant');
    expect(nailUrl).not.toBe(foodUrl);
  });
});

describe('selectBestCandidateMedia', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
    await resetMediaEvidenceForTests();
  });

  it('prefers provider media over category stock', async () => {
    const candidate = sampleCandidate({ businessType: 'nail salon', id: 'cand-nail-1' });
    await saveBusinessCandidate(candidate);
    await runMediaDiscoveryForCandidate(candidate);
    const selected = await selectBestCandidateMedia(candidate.id, { discoverIfEmpty: false });
    expect(selected?.heroImage?.sourceType).toBe('provider_photo');
    expect(selected?.representativeDisclosureRequired).toBe(false);
  });

  it('shows representative disclosure when only fallback exists', async () => {
    const candidate = sampleCandidate({
      id: 'cand-fallback-1',
      businessType: 'hair salon',
      rawSourceJson: null,
      sourceUrl: null,
      fetchedImages: [],
    });
    await saveBusinessCandidate(candidate);
    await runMediaDiscoveryForCandidate(candidate);
    const selected = await selectBestCandidateMedia(candidate.id, { discoverIfEmpty: false });
    expect(selected?.representativeDisclosureRequired).toBe(true);
    expect(selected?.heroImage?.sourceType).toBe('category_stock');
  });
});

describe('generateBusinessIntelligenceBrief', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
    await resetMediaEvidenceForTests();
    await resetBriefsForTests();
  });

  it('only includes evidence-backed fields', async () => {
    const candidate = sampleCandidate({ id: 'cand-brief-1' });
    await saveBusinessCandidate(candidate);
    await runMediaDiscoveryForCandidate(candidate);
    const brief = await generateBusinessIntelligenceBrief(candidate.id);
    expect(brief).not.toBeNull();
    expect(brief!.generatedMarkdown).not.toMatch(/rank #/i);
    expect(brief!.generatedMarkdown).not.toMatch(/more customers/i);
    expect(brief!.evidenceJson).toHaveProperty('evidenceFound');
    expect(brief!.visibility.overall).toBeGreaterThanOrEqual(0);
    expect(brief!.visibility.seoReadiness).toBeLessThanOrEqual(100);
    expect(brief!.disclaimer).toContain('verified by the business owner');
  });
});

describe('ClaimIntent + download governance', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
    await resetBriefsForTests();
    await resetClaimIntentsForTests();
  });

  it('anonymous download routes to registration', async () => {
    const candidate = sampleCandidate({ id: 'cand-dl-1' });
    await saveBusinessCandidate(candidate);
    const result = await recordBriefDownloadIntent({ candidateId: candidate.id, seedId: candidate.seedId });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.action).toBe('registration_required');
  });

  it('logged-in download starts claim intent before download', async () => {
    const candidate = sampleCandidate({ id: 'cand-dl-2' });
    await saveBusinessCandidate(candidate);
    const intentResult = await recordBriefDownloadIntent({
      candidateId: candidate.id,
      seedId: candidate.seedId,
      userId: 'user-1',
    });
    expect(intentResult.ok).toBe(true);
    if (intentResult.ok) expect(intentResult.action).toBe('claim_required');
    const intents = await listClaimIntents();
    expect(intents.some((i) => i.source === 'BI_BRIEF_DOWNLOAD')).toBe(true);
  });

  it('claim button creates ClaimIntent source CLAIM_BUTTON', async () => {
    await recordClaimButtonIntent({ seedId: 'seed-abc', userId: 'user-2' });
    const intents = await listClaimIntents();
    expect(intents.find((i) => i.source === 'CLAIM_BUTTON')).toBeTruthy();
  });

  it('no Store is created from media discovery or BI download', async () => {
    const candidate = sampleCandidate({ id: 'cand-store-guard', storeId: null });
    await saveBusinessCandidate(candidate);
    await runMediaDiscoveryForCandidate(candidate);
    await generateBusinessIntelligenceBrief(candidate.id);
    await recordBriefDownloadIntent({
      candidateId: candidate.id,
      userId: 'user-3',
      seedId: candidate.seedId,
    });
    const { getBusinessCandidateById } = await import('../candidateRepository.js');
    const after = await getBusinessCandidateById(candidate.id);
    expect(after?.storeId).toBeNull();
    expect(after?.storeDraftId).toBeNull();
  });
});

describe('Batch 0 protection', () => {
  it('Batch 0 remains protected from enrichment', () => {
    expect(isProtectedBatch0('MELBOURNE_BATCH0_20260617')).toBe(true);
    expect(isProtectedBatch0('MELBOURNE_BATCH001_REAL_LOCAL')).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BusinessCandidateRecord } from '../../businessCandidate/types.js';
import { resetPublicBusinessCardsForTests } from '../cardRepository.js';
import {
  getPublicCardDto,
  prepareCardFromCandidate,
  publishCard,
  submitCorrection,
} from '../publicCardService.js';
import { PUBLIC_CARD_DISCLOSURE } from '../types.js';

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-public-1',
    batchId: 'MM_AU_VIC_FOOD_TEST',
    campaignId: null,
    name: 'River Bakery',
    businessType: 'bakery',
    address: '12 High St',
    suburb: 'Footscray',
    city: 'Melbourne',
    state: 'VIC',
    postcode: '3011',
    country: 'AU',
    phone: '+61390000000',
    website: 'https://river-bakery.example',
    email: 'owner@river-bakery.example',
    socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/riverbakery' }],
    coordinates: { lat: -37.8, lng: 144.9 },
    discoveredFrom: 'osm',
    confidenceScore: 0.93,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: null,
    sourceUrl: 'https://river-bakery.example',
    rawSourceJson: null,
    seedId: 'seed-public-1',
    status: 'CLAIMABLE',
    dedupeKey: 'river-bakery|12 high st|footscray',
    discoveryProviderId: 'osm',
    externalId: 'ext-public-1',
    createdAt: now,
    updatedAt: now,
    description: 'Independent bakery with daily bread and pastries.',
    category: 'Food & Drink',
    openingHours: 'Mon-Sat 7:00-15:00',
    heroImageUrl: 'https://img.example/river-bakery.jpg',
    heroImageSource: 'candidate.heroImageUrl',
    ...overrides,
  };
}

describe('publicCardService', () => {
  let tmpDir: string;
  const prevDir = process.env.PUBLIC_BUSINESS_CARD_DIR;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'public-card-'));
    process.env.PUBLIC_BUSINESS_CARD_DIR = tmpDir;
    await resetPublicBusinessCardsForTests();
  });

  afterEach(async () => {
    if (prevDir === undefined) delete process.env.PUBLIC_BUSINESS_CARD_DIR;
    else process.env.PUBLIC_BUSINESS_CARD_DIR = prevDir;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('does not prepare or publish from DISCOVERED candidates', async () => {
    await expect(
      prepareCardFromCandidate(sampleCandidate({ status: 'DISCOVERED', seedId: null })),
    ).rejects.toThrow(/CLAIMABLE\/VERIFIED/);
  });

  it('returns a public dto with disclosure and without private fields', async () => {
    const prepared = await prepareCardFromCandidate(sampleCandidate());
    await publishCard(prepared.id, 'admin-1');

    const dto = await getPublicCardDto(prepared.slug);

    expect(dto).not.toBeNull();
    expect(dto?.disclosure).toBe(PUBLIC_CARD_DISCLOSURE);
    expect(dto?.businessName).toBe('River Bakery');
    expect('candidateId' in (dto as Record<string, unknown>)).toBe(false);
    expect('seedId' in (dto as Record<string, unknown>)).toBe(false);
    expect('noindex' in (dto as Record<string, unknown>)).toBe(false);
    expect('supersededStoreId' in (dto as Record<string, unknown>)).toBe(false);
  });

  it('stores correction reports with redacted contact and marks correction pending', async () => {
    const prepared = await prepareCardFromCandidate(sampleCandidate());
    await publishCard(prepared.id, 'admin-2');

    const report = await submitCorrection(
      prepared.slug,
      'The phone number is outdated.',
      'owner@river-bakery.example',
    );

    const dto = await getPublicCardDto(prepared.slug);

    expect(report.reporterContactRedacted).toBe('o***@river-bakery.example');
    expect(report.message).toMatch(/outdated/i);
    expect(dto?.status).toBe('CORRECTION_PENDING');
  });
});

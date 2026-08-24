/**
 * Pilot acceptance fixtures — Australia Sydney + Vietnam HCMC paths (no live providers).
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareMultiMarketDiscoveryJob } from '../multiMarketDiscoveryService.js';
import { prepareCardFromCandidate, publishCard, getPublicCardDto } from '../../publicBusinessCard/index.js';
import {
  generateDraftFromCandidate,
  buildConversionPlan,
  assertConversionAllowed,
} from '../../prebuiltStore/index.js';
import type { BusinessCandidateRecord } from '../../businessCandidate/types.js';
import { PUBLIC_CARD_DISCLOSURE } from '../../publicBusinessCard/types.js';

function baseCandidate(
  overrides: Partial<BusinessCandidateRecord> & Pick<BusinessCandidateRecord, 'id' | 'name'>,
): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    batchId: 'fixture',
    campaignId: null,
    businessType: 'cafe',
    address: null,
    suburb: null,
    city: null,
    state: null,
    postcode: null,
    country: 'AU',
    phone: null,
    website: null,
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'manual',
    confidenceScore: 0.9,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [{ name: 'Espresso', description: 'Source-confirmed service' }],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: null,
    sourceUrl: null,
    rawSourceJson: null,
    seedId: null,
    status: 'CLAIMABLE',
    dedupeKey: overrides.id,
    discoveryProviderId: 'manual',
    externalId: overrides.id,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('pilot acceptance fixtures', () => {
  let tmpCard: string;
  let tmpDraft: string;
  let prevCard: string | undefined;
  let prevDraft: string | undefined;

  beforeEach(async () => {
    tmpCard = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-card-'));
    tmpDraft = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-draft-'));
    prevCard = process.env.PUBLIC_BUSINESS_CARD_DIR;
    prevDraft = process.env.PREBUILT_STORE_DIR;
    process.env.PUBLIC_BUSINESS_CARD_DIR = tmpCard;
    process.env.PREBUILT_STORE_DIR = tmpDraft;
  });

  afterEach(async () => {
    if (prevCard === undefined) delete process.env.PUBLIC_BUSINESS_CARD_DIR;
    else process.env.PUBLIC_BUSINESS_CARD_DIR = prevCard;
    if (prevDraft === undefined) delete process.env.PREBUILT_STORE_DIR;
    else process.env.PREBUILT_STORE_DIR = prevDraft;
    await fs.rm(tmpCard, { recursive: true, force: true });
    await fs.rm(tmpDraft, { recursive: true, force: true });
  });

  it('AU Sydney dry-run job is bounded and prepares card + draft after QA-shaped candidate', async () => {
    const job = prepareMultiMarketDiscoveryJob({
      countryCode: 'AU',
      territoryId: 'au-nsw-sydney',
      categoryId: 'food_hospitality',
      dryRun: true,
      requestedLimit: 20,
    });
    expect(job.dryRun).toBe(true);
    expect(job.estimatedQueryCount).toBe(1);

    const candidate = baseCandidate({
      id: 'au-syd-1',
      name: 'Sydney Harbour Cafe',
      country: 'AU',
      countryCode: 'AU',
      territoryId: 'au-nsw-sydney',
      locality: 'Sydney',
      city: 'Sydney',
      state: 'NSW',
      address: '1 Circular Quay',
      phone: '0299998888',
      website: 'https://example-sydney-cafe.example',
      batchId: job.batchId,
      status: 'CLAIMABLE',
    });

    const card = await prepareCardFromCandidate(candidate);
    expect(card.status).toBe('CARD_ELIGIBLE');
    const published = await publishCard(card.id, 'admin');
    expect(published.status).toBe('PUBLISHED_UNCLAIMED');
    const dto = await getPublicCardDto(published.slug);
    expect(dto?.disclosure).toBe(PUBLIC_CARD_DISCLOSURE);
    expect(dto).not.toHaveProperty('email');

    const draft = await generateDraftFromCandidate(candidate, { allowAiSuggestions: false });
    expect(draft.publicFeedExcluded).toBe(true);
    expect(draft.offerings.every((o) => o.priceText == null)).toBe(true);
  });

  it('VN HCMC preserves original text and requires AI acceptance', async () => {
    const job = prepareMultiMarketDiscoveryJob({
      countryCode: 'VN',
      territoryId: 'vn-hcm',
      categoryId: 'coffee_beverages',
      language: 'vi',
      dryRun: true,
      requestedLimit: 20,
    });
    expect(job.language).toBe('vi');

    const candidate = baseCandidate({
      id: 'vn-hcm-1',
      name: 'Cà Phê Sài Gòn',
      originalName: 'Cà Phê Sài Gòn',
      country: 'VN',
      countryCode: 'VN',
      territoryId: 'vn-hcm',
      locality: 'Quận 1',
      city: 'Quận 1',
      address: '12 Nguyễn Huệ',
      phone: '0903123456',
      batchId: job.batchId,
      status: 'CLAIMABLE',
      fetchedServices: [{ name: 'Cà phê sữa đá', description: 'Source-confirmed' }],
    });

    expect(candidate.name).toBe('Cà Phê Sài Gòn');
    const draft = await generateDraftFromCandidate(candidate, { allowAiSuggestions: true });
    const confirmed = draft.offerings.filter((o) => o.evidenceClass === 'SOURCE_CONFIRMED');
    const ai = draft.offerings.filter((o) => o.evidenceClass === 'AI_SUGGESTED');
    expect(confirmed.length).toBeGreaterThanOrEqual(1);
    expect(ai.length).toBeGreaterThanOrEqual(1);
    expect(ai.every((o) => o.ownerAccepted === false)).toBe(true);

    expect(() =>
      assertConversionAllowed({
        draft,
        candidate,
        claimVerified: true,
      }),
    ).toThrow(/AI suggested offerings require explicit owner acceptance/);

    const acceptedDraft = {
      ...draft,
      offerings: draft.offerings.map((o) =>
        o.evidenceClass === 'AI_SUGGESTED' ? { ...o, ownerAccepted: true, included: true } : o,
      ),
    };
    const plan = buildConversionPlan({
      draft: acceptedDraft,
      candidate,
      claimVerified: true,
    });
    expect(plan.mode).toBe('stub');
    expect(plan.acceptedOfferings.some((o) => o.title.includes('Cà phê') || o.title.length > 0)).toBe(
      true,
    );
  });
});

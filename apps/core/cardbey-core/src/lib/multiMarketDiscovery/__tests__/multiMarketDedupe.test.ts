/**
 * Multi-market dedupe — translated names alone must not merge.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkMultiMarketDuplicate } from '../multiMarketDedupe.js';
import type { BusinessCandidate } from '../../discoveryEngine/types/index.js';

function candidate(partial: Partial<BusinessCandidate> & { businessName: string }): BusinessCandidate {
  return {
    providerId: 'manual',
    externalId: partial.externalId ?? `ext-${partial.businessName}`,
    businessName: partial.businessName,
    category: partial.category ?? 'cafe',
    address: partial.address ?? null,
    city: partial.city ?? null,
    state: partial.state ?? null,
    postcode: partial.postcode ?? null,
    country: partial.country ?? 'VN',
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    phone: partial.phone ?? null,
    email: null,
    website: partial.website ?? null,
    socialProfiles: [],
    sourceUrl: null,
    discoveredAt: new Date().toISOString(),
    confidence: 0.8,
    metadata: partial.metadata ?? {},
  };
}

describe('multiMarketDedupe', () => {
  let tmpDir: string;
  let prevDir: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-dedupe-'));
    prevDir = process.env.BUSINESS_CANDIDATE_DIR;
    process.env.BUSINESS_CANDIDATE_DIR = tmpDir;
    await fs.writeFile(
      path.join(tmpDir, 'candidates.json'),
      JSON.stringify([
        {
          id: 'existing-1',
          batchId: 'b1',
          campaignId: null,
          name: 'Cà Phê Ông Bầu',
          originalName: 'Cà Phê Ông Bầu',
          businessType: 'cafe',
          address: '1 Nguyễn Huệ',
          suburb: 'Quận 1',
          city: 'Quận 1',
          state: null,
          postcode: null,
          country: 'VN',
          countryCode: 'VN',
          phone: '0901111111',
          website: null,
          email: null,
          socialLinks: [],
          coordinates: null,
          discoveredFrom: 'manual',
          confidenceScore: 0.8,
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
          sourceUrl: null,
          rawSourceJson: null,
          seedId: null,
          status: 'DISCOVERED',
          dedupeKey: 'x',
          discoveryProviderId: 'manual',
          externalId: 'e1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
      'utf8',
    );
  });

  afterEach(async () => {
    if (prevDir === undefined) delete process.env.BUSINESS_CANDIDATE_DIR;
    else process.env.BUSINESS_CANDIDATE_DIR = prevDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('does not merge solely because English translated names match', async () => {
    const decision = await checkMultiMarketDuplicate({
      candidate: candidate({
        businessName: 'Completely Different Vietnamese Name',
        city: 'Đà Nẵng',
        country: 'VN',
      }),
      countryCode: 'VN',
      translatedName: 'Mr Bau Coffee', // fictional EN label that might collide with another row's EN
    });
    // Without place/phone/website/locality match, must remain unique (or review only if same locality)
    expect(decision.decision).toBe('unique');
  });

  it('matches on normalised phone', async () => {
    const decision = await checkMultiMarketDuplicate({
      candidate: candidate({
        businessName: 'Other Name',
        phone: '+84 901 111 111',
        city: 'Hà Nội',
        country: 'VN',
      }),
      countryCode: 'VN',
    });
    expect(decision.decision).toBe('duplicate');
    if (decision.decision === 'duplicate') {
      expect(decision.reason).toBe('normalised_phone');
    }
  });
});

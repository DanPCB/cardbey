import { describe, expect, it, beforeAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { discoverBookwellVenueSource } from '../bookwellVenueDiscovery.js';
import { isGooglePlacesConfigured } from '../../businessDiscovery/businessDiscoverySources.js';
import { runStoreCreationResearch } from '../businessResearchAgent.js';

const runLive = process.env.BOOKWELL_LIVE_TEST === '1';

describe.skipIf(!runLive)('bookwell live integration', () => {
  beforeAll(() => {
    loadDotenv({ path: resolve(process.cwd(), '.env') });
    loadDotenv({ path: resolve(process.cwd(), '.env.local'), override: true });
  });
  it('discovers Glamshell Beauty services from Bookwell', async () => {
    const source = await discoverBookwellVenueSource('Glamshell Beauty', 'Melbourne', 'Beauty');
    expect(source?.sourceUrl).toMatch(/glamshell-beauty\/williamstown/);
    expect(source?.raw?.offers?.length).toBeGreaterThan(0);
    expect(source.raw.offers.some((o) => /sns|pedicure|shellac/i.test(o.name))).toBe(true);
  }, 60_000);

  it('builds research catalog for Glamshell without website', async () => {
    const result = await runStoreCreationResearch(
      {
        businessName: 'Glamshell Beauty',
        location: 'Melbourne',
        category: 'Beauty',
        missionId: 'live-test-mission',
      },
      { skipNetwork: false },
    );
    expect(result.fallbackToGenerated).toBe(false);
    expect(result.catalog?.products?.length).toBeGreaterThan(0);
    const names = (result.catalog?.products ?? []).map((p) => p.name).join(' | ');
    expect(names).toMatch(/sns|pedicure|shellac|eyelash/i);
    const googleMatched = (result.sourcesUsed ?? []).some(
      (s) => s.source?.sourceType === 'google_business',
    );
    if (isGooglePlacesConfigured()) {
      expect(googleMatched).toBe(true);
    }
  }, 90_000);
});

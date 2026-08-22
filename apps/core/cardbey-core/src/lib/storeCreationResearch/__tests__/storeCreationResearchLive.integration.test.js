/**
 * Opt-in live Places + website research (not run in CI).
 *
 *   STORE_RESEARCH_LIVE_TEST=1 npx vitest run src/lib/storeCreationResearch/__tests__/storeCreationResearchLive.integration.test.js
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { isGooglePlacesConfigured } from '../../businessDiscovery/businessDiscoverySources.js';
import { runStoreCreationResearch } from '../businessResearchAgent.js';

const runLive = process.env.STORE_RESEARCH_LIVE_TEST === '1';

describe.skipIf(!runLive)('store creation research live (Places + website)', () => {
  beforeAll(() => {
    loadDotenv({ path: resolve(process.cwd(), '.env') });
    loadDotenv({ path: resolve(process.cwd(), '.env.local'), override: true });
  });

  it('sources MSD catalog from Place website without a typed URL', async () => {
    expect(isGooglePlacesConfigured()).toBe(true);

    const result = await runStoreCreationResearch(
      {
        businessName: 'Modern Security Doors',
        location: 'Ravenhall VIC 3023',
        category: 'Home & garden',
        missionId: 'live-store-research-msd',
      },
      { skipNetwork: false, prisma: null },
    );

    expect(result.researchRan).toBe(true);
    expect(result.fallbackToGenerated).toBe(false);
    const names = [
      ...(result.catalog?.products ?? []).map((p) => p.name),
      ...(result.extractedItems ?? []).map((p) => p.name),
    ]
      .filter(Boolean)
      .join(' | ');
    expect(names.length).toBeGreaterThan(0);
    expect(names).toMatch(/shutter|door|screen|blind/i);
    const websiteMatched = (result.sourcesUsed ?? []).some(
      (s) => s.source?.sourceType === 'official_website' || s.sourceType === 'official_website',
    );
    expect(websiteMatched).toBe(true);
  }, 90_000);
});

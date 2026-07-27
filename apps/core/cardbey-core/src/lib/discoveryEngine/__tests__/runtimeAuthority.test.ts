import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDiscoverySeedsGoverned,
  DISCOVERY_PIPELINE_GOVERNANCE,
} from '../governance/runtimeAuthority.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMOTION_FILE = path.resolve(__dirname, '../pipelines/DiscoveryPromotionPipeline.ts');
const SERVICE_FILE = path.resolve(__dirname, '../discoveryEngineService.ts');

describe('runtime authority', () => {
  it('promotion pipeline governance contract is locked', () => {
    expect(DISCOVERY_PIPELINE_GOVERNANCE.persistStores).toBe(false);
    expect(DISCOVERY_PIPELINE_GOVERNANCE.persistSeeds).toBe(true);
  });

  it('DiscoveryPromotionPipeline source never sets persistStores true', () => {
    const src = readFileSync(PROMOTION_FILE, 'utf8');
    expect(src).toContain('persistStores: false');
    expect(src).not.toMatch(/persistStores:\s*true/);
  });

  it('discoveryEngineService asserts governed seeds after promotion', () => {
    const src = readFileSync(SERVICE_FILE, 'utf8');
    expect(src).toContain('assertDiscoverySeedsGoverned');
  });

  it('rejects seeds with storeId or draftId', () => {
    expect(() =>
      assertDiscoverySeedsGoverned([
        {
          id: 's1',
          normalized: {} as never,
          resolution: 'unique',
          matchEvidence: [],
          qualityScore: 50,
          qualityTier: 'medium_quality',
          verificationStatus: 'seeded_pending_qa',
          claimable: false,
          publicVisibility: 'limited',
          ownerUserId: null,
          storeId: 'store-123',
          draftId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          batchId: null,
          campaignId: null,
        },
      ]),
    ).toThrow(/storeId/);
  });

  it('accepts governed pending QA seeds', () => {
    expect(() =>
      assertDiscoverySeedsGoverned([
        {
          id: 's2',
          normalized: {} as never,
          resolution: 'unique',
          matchEvidence: [],
          qualityScore: 50,
          qualityTier: 'medium_quality',
          verificationStatus: 'seeded_pending_qa',
          claimable: false,
          publicVisibility: 'limited',
          ownerUserId: null,
          storeId: null,
          draftId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          batchId: null,
          campaignId: null,
        },
      ]),
    ).not.toThrow();
  });
});

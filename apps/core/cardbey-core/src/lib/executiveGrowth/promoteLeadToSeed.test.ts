import { describe, expect, it } from 'vitest';
import {
  isLegacyGrowthStoreCreationEnabled,
  LEGACY_STORE_CREATION_DISABLED_MESSAGE,
} from './growthGovernanceConfig.js';
import { findLeadPromotionDuplicate } from './promoteLeadToSeed.js';

describe('growthGovernanceConfig', () => {
  it('disables legacy store creation by default', () => {
    const prev = process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION;
    delete process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION;
    expect(isLegacyGrowthStoreCreationEnabled()).toBe(false);
    expect(LEGACY_STORE_CREATION_DISABLED_MESSAGE).toMatch(/Discovery Engine V1/);
    if (prev !== undefined) process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION = prev;
  });

  it('enables legacy store creation when env is true', () => {
    const prev = process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION;
    process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION = 'true';
    expect(isLegacyGrowthStoreCreationEnabled()).toBe(true);
    if (prev !== undefined) process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION = prev;
    else delete process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION;
  });
});

describe('findLeadPromotionDuplicate', () => {
  it('returns no duplicate for empty corpus', async () => {
    const result = await findLeadPromotionDuplicate({
      businessName: 'Unique Cafe Melbourne',
      city: 'Melbourne',
      email: 'unique@example.com',
    });
    expect(result.duplicate).toBe(false);
  });
});

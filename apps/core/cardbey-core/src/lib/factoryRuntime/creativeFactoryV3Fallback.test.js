import { describe, it, expect, afterEach } from 'vitest';
import {
  isCreativeFactoryV3Enabled,
  resolveCreativeFactoryId,
} from './factoryBootstrap.js';
import {
  CREATIVE_ASSET_FACTORY_V1_ID,
  CREATIVE_ASSET_FACTORY_V2_ID,
  CREATIVE_ASSET_FACTORY_V3_ID,
} from './factoryConstants.js';

describe('creativeFactoryV3 fallback', () => {
  const prev = {
    v1: process.env.ENABLE_CREATIVE_FACTORY_V1,
    v2: process.env.ENABLE_CREATIVE_FACTORY_V2,
    v3: process.env.ENABLE_CREATIVE_FACTORY_V3,
  };

  afterEach(() => {
    for (const [key, val] of Object.entries(prev)) {
      const envKey =
        key === 'v1'
          ? 'ENABLE_CREATIVE_FACTORY_V1'
          : key === 'v2'
            ? 'ENABLE_CREATIVE_FACTORY_V2'
            : 'ENABLE_CREATIVE_FACTORY_V3';
      if (val === undefined) delete process.env[envKey];
      else process.env[envKey] = val;
    }
  });

  it('defaults V3 off and falls back V3 → V2 → V1', () => {
    delete process.env.ENABLE_CREATIVE_FACTORY_V3;
    process.env.ENABLE_CREATIVE_FACTORY_V2 = 'true';
    expect(isCreativeFactoryV3Enabled()).toBe(false);
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V2_ID);

    delete process.env.ENABLE_CREATIVE_FACTORY_V2;
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V1_ID);
  });

  it('selects V3 when flag enabled', () => {
    process.env.ENABLE_CREATIVE_FACTORY_V3 = 'true';
    process.env.ENABLE_CREATIVE_FACTORY_V2 = 'true';
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V3_ID);
  });
});

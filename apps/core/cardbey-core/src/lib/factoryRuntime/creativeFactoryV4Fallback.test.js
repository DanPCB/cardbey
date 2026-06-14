import { describe, it, expect, afterEach } from 'vitest';
import {
  isCreativeFactoryV4Enabled,
  resolveCreativeFactoryId,
} from './factoryBootstrap.js';
import {
  CREATIVE_ASSET_FACTORY_V3_ID,
  CREATIVE_ASSET_FACTORY_V4_ID,
} from './factoryConstants.js';

describe('creativeFactoryV4 fallback', () => {
  const prev = {
    v3: process.env.ENABLE_CREATIVE_FACTORY_V3,
    v4: process.env.ENABLE_CREATIVE_FACTORY_V4,
  };

  afterEach(() => {
    for (const [key, val] of Object.entries(prev)) {
      const envKey = key === 'v3' ? 'ENABLE_CREATIVE_FACTORY_V3' : 'ENABLE_CREATIVE_FACTORY_V4';
      if (val === undefined) delete process.env[envKey];
      else process.env[envKey] = val;
    }
  });

  it('defaults V4 off and falls back to V3', () => {
    delete process.env.ENABLE_CREATIVE_FACTORY_V4;
    process.env.ENABLE_CREATIVE_FACTORY_V3 = 'true';
    expect(isCreativeFactoryV4Enabled()).toBe(false);
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V3_ID);
  });

  it('selects V4 when flag enabled', () => {
    process.env.ENABLE_CREATIVE_FACTORY_V4 = 'true';
    expect(resolveCreativeFactoryId()).toBe(CREATIVE_ASSET_FACTORY_V4_ID);
  });
});

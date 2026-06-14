import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isCreativeFactoryIntent,
  isCreativeFactoryV1Enabled,
} from './factoryIntentRouter.js';

describe('factoryIntentRouter', () => {
  const prev = process.env.ENABLE_CREATIVE_FACTORY_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_CREATIVE_FACTORY_V1;
    else process.env.ENABLE_CREATIVE_FACTORY_V1 = prev;
  });

  it('isCreativeFactoryV1Enabled defaults true unless explicitly disabled', () => {
    delete process.env.ENABLE_CREATIVE_FACTORY_V1;
    expect(isCreativeFactoryV1Enabled()).toBe(true);
    process.env.ENABLE_CREATIVE_FACTORY_V1 = 'false';
    expect(isCreativeFactoryV1Enabled()).toBe(false);
  });

  it('matches skill triggers and natural language creative intents', () => {
    expect(isCreativeFactoryIntent('create_video', '')).toBe(true);
    expect(isCreativeFactoryIntent('promotional_video', '')).toBe(true);
    expect(isCreativeFactoryIntent('', 'create a promotional video for my store')).toBe(true);
    expect(isCreativeFactoryIntent('', 'make an ad video')).toBe(true);
    expect(isCreativeFactoryIntent('', 'create a creative asset')).toBe(true);
    expect(isCreativeFactoryIntent('', 'analyze store performance')).toBe(false);
  });
});

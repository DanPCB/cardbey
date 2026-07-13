import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDefaultTopologyForThreshold,
  isDefaultTemplateFallbackEnabled,
} from '../defaultLoyaltyCardTopology.js';

describe('defaultLoyaltyCardTopology', () => {
  const prev = process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE;

  afterEach(() => {
    if (prev === undefined) delete process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE;
    else process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE = prev;
  });

  it('builds synthetic topology when fallback enabled', () => {
    delete process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE;
    const topology = buildDefaultTopologyForThreshold(8);
    expect(topology).not.toBeNull();
    expect(topology?.source).toBe('DEFAULT_TEMPLATE');
    expect(isDefaultTemplateFallbackEnabled()).toBe(true);
  });

  it('returns null when LOYALTY_DISABLE_DEFAULT_TEMPLATE=true', () => {
    process.env.LOYALTY_DISABLE_DEFAULT_TEMPLATE = 'true';
    expect(isDefaultTemplateFallbackEnabled()).toBe(false);
    expect(buildDefaultTopologyForThreshold(8)).toBeNull();
  });
});

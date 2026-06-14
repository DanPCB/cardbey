import { describe, it, expect } from 'vitest';
import { resolveDeepLink } from '../visionDeepLinkResolver.js';

describe('resolveDeepLink', () => {
  it('opens Cardbey storefront from full URL', () => {
    expect(resolveDeepLink('https://www.cardbey.com/s/melbourne-flooring')).toEqual({
      action: 'open_store',
      slug: 'melbourne-flooring',
    });
  });

  it('opens Cardbey storefront from path-only payload', () => {
    expect(resolveDeepLink('/s/demo-cafe')).toEqual({
      action: 'open_store',
      slug: 'demo-cafe',
    });
  });

  it('returns external_url for non-Cardbey https links', () => {
    expect(resolveDeepLink('https://example.com/menu')).toEqual({
      action: 'external_url',
      url: 'https://example.com/menu',
    });
  });

  it('returns show_payload for opaque text', () => {
    expect(resolveDeepLink('WIFI:S:Guest;T:WPA;P:secret;;')).toEqual({
      action: 'show_payload',
      payload: 'WIFI:S:Guest;T:WPA;P:secret;;',
    });
  });
});

import { describe, it, expect } from 'vitest';
import { isBotRequest, renderStoreHtml, BOT_UA } from '../storefrontPrerenderRoutes.js';
import { buildSKPFromSources } from '../../lib/storeKnowledge/index.js';

describe('storefront prerender helpers', () => {
  it('detects common crawler user agents', () => {
    expect(isBotRequest({ get: () => 'Mozilla/5.0 (compatible; Googlebot/2.1)', query: {} })).toBe(
      true,
    );
    expect(isBotRequest({ get: () => 'Mozilla/5.0 ChatGPT-User', query: {} })).toBe(true);
    expect(isBotRequest({ get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', query: {} })).toBe(
      false,
    );
    expect(
      isBotRequest({
        get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        query: { _prerender: '1' },
      }),
    ).toBe(true);
    expect(BOT_UA.test('GPTBot')).toBe(true);
  });

  it('renderStoreHtml includes canonical, robots, and JSON-LD when ready', () => {
    const skp = buildSKPFromSources({
      business: {
        id: 'biz_1',
        slug: 'demo-cafe',
        name: 'Demo Cafe',
        description: 'Specialty coffee in Melbourne CBD.',
        type: 'Cafe',
        suburb: 'Melbourne',
        state: 'VIC',
        country: 'AU',
        publishedAt: new Date('2026-01-01'),
        isActive: true,
        provenance: 'owner',
        claimStatus: 'claimed',
      },
    });
    expect(skp).not.toBeNull();
    const html = renderStoreHtml(skp);
    expect(html).toContain('application/ld+json');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('/s/demo-cafe');
    expect(html).toContain('Demo Cafe');
    expect(html).toContain('index,follow');
  });
});

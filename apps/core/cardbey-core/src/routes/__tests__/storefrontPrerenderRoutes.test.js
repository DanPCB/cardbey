import { describe, it, expect } from 'vitest';
import {
  isBotRequest,
  renderStoreHtml,
  BOT_UA,
} from '../storefrontPrerenderRoutes.js';
import storefrontPrerenderRoutes from '../storefrontPrerenderRoutes.js';
import { buildSKPFromSources } from '../../lib/storeKnowledge/index.js';
import express from 'express';

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

describe('storefront prerender route fallthrough', () => {
  it('browser UA calls next() (does not JSON 404)', async () => {
    const app = express();
    app.use('/s', storefrontPrerenderRoutes);
    let fellThrough = false;
    app.use((req, res) => {
      fellThrough = true;
      res.status(200).send('SPA');
    });

    const res = await new Promise((resolve, reject) => {
      const server = app.listen(0, async () => {
        try {
          const { port } = server.address();
          const r = await fetch(`http://127.0.0.1:${port}/s/demo-cafe`, {
            headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });
          const text = await r.text();
          server.close();
          resolve({ status: r.status, text, header: r.headers.get('x-cardbey-prerender') });
        } catch (err) {
          server.close();
          reject(err);
        }
      });
    });

    expect(res.status).toBe(200);
    expect(res.text).toBe('SPA');
    expect(res.header).toBe('skip');
    expect(fellThrough).toBe(true);
  });
});

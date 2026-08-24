/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { classifyPageType, discoverCommercialPages, PAGE_TYPES } from '../semanticPageDiscovery.js';
import {
  extractOfferingsFromPageHtml,
  dedupeOfferings,
  offeringsToExtractedCatalogItems,
  REJECT_NAME_RE,
} from '../semanticOfferingExtract.js';

describe('Mission001 offering reconstruction Gate A — page discovery', () => {
  it('classifies commercial vs editorial pages', () => {
    expect(classifyPageType('https://ex.com/products', 'Products')).toBe(PAGE_TYPES.PRODUCT_COLLECTION);
    expect(classifyPageType('https://ex.com/services', 'Services')).toBe(PAGE_TYPES.SERVICE_COLLECTION);
    expect(classifyPageType('https://ex.com/solutions', 'Solutions')).toBe(PAGE_TYPES.SOLUTION);
    expect(classifyPageType('https://ex.com/blog/hello', 'Blog')).toBe(PAGE_TYPES.BLOG);
    expect(classifyPageType('https://ex.com/careers', 'Careers')).toBe(PAGE_TYPES.CAREERS);
  });

  it('discovers commercial links and skips careers/blog', () => {
    const html = `
      <a href="/products">Our Products</a>
      <a href="/services">Services</a>
      <a href="/blog">Blog</a>
      <a href="/careers">Careers</a>
      <a href="/solutions">Solutions</a>
    `;
    const pages = discoverCommercialPages(html, 'https://example.com', { maxPages: 10 });
    const types = pages.map((p) => p.pageType);
    expect(types).toContain(PAGE_TYPES.PRODUCT_COLLECTION);
    expect(types).toContain(PAGE_TYPES.SERVICE_COLLECTION);
    expect(types).not.toContain(PAGE_TYPES.BLOG);
    expect(types).not.toContain(PAGE_TYPES.CAREERS);
  });
});

describe('Mission001 offering reconstruction Gate B/C — extract + reject', () => {
  const html = `
    <html><body>
      <h1>Security Doors</h1>
      <h2>Hinged Security Doors</h2>
      <h2>Sliding Security Doors</h2>
      <h2>Careers</h2>
      <h2>John Smith</h2>
      <nav><a href="/products/hinged">Hinged Doors</a></nav>
      <script type="application/ld+json">
        {"@type":"Product","name":"Custom Entrance Door","offers":{"@type":"Offer","price":"1200"}}
      </script>
    </body></html>
  `;

  it('extracts evidence-supported offerings and rejects careers/person names', () => {
    const { offerings, rejected } = extractOfferingsFromPageHtml({
      html,
      pageUrl: 'https://doors.example/products',
      pageType: PAGE_TYPES.PRODUCT_COLLECTION,
      businessName: 'Modern Security Doors',
      vertical: 'security',
    });
    const names = offerings.map((o) => o.name);
    expect(names.some((n) => /hinged|sliding|entrance|security doors/i.test(n))).toBe(true);
    expect(names.some((n) => /careers/i.test(n))).toBe(false);
    expect(rejected.some((r) => /careers|person/i.test(r.reason) || /careers|john/i.test(r.name))).toBe(true);
  });

  it('dedupes near-duplicate labels', () => {
    const deduped = dedupeOfferings([
      { name: 'Security Doors', confidence: 0.7 },
      { name: 'Our Security Doors', confidence: 0.65 },
      { name: 'Sliding Security Doors', confidence: 0.8 },
    ]);
    expect(deduped.length).toBeLessThanOrEqual(2);
    expect(deduped.some((o) => /sliding/i.test(o.name))).toBe(true);
  });

  it('maps medium/high offerings to extracted catalog items without inventing prices', () => {
    const items = offeringsToExtractedCatalogItems([
      {
        name: 'Security Door Installation',
        confidence: 0.75,
        confidenceBand: 'MEDIUM',
        offeringType: 'SERVICE',
        price: null,
        pageUrl: 'https://doors.example/services',
        sourceMethod: 'heading_h2',
      },
      {
        name: 'Weak Guess',
        confidence: 0.4,
        confidenceBand: 'LOW',
        offeringType: 'OTHER',
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].price).toBeNull();
    expect(items[0].priceWasNotExplicitlyProvided).toBe(true);
    expect(items[0].contentOrigin).toBe('sourced');
  });

  it('reject regex catches blog/careers/news', () => {
    expect(REJECT_NAME_RE.test('Careers')).toBe(true);
    expect(REJECT_NAME_RE.test('Latest Blog Post')).toBe(true);
    expect(REJECT_NAME_RE.test('Hinged Security Door')).toBe(false);
  });

  it('does not treat Title Case product labels as person names', () => {
    const { offerings, rejected } = extractOfferingsFromPageHtml({
      html: '<html><body><h2>Face Primers</h2><h2>Setting Powders</h2><h2>John Smith</h2></body></html>',
      pageUrl: 'https://shop.example/makeup',
      pageType: PAGE_TYPES.PRODUCT_COLLECTION,
      businessName: 'Mecca',
    });
    const names = offerings.map((o) => o.name);
    expect(names).toContain('Face Primers');
    expect(names).toContain('Setting Powders');
    expect(names.some((n) => /john smith/i.test(n))).toBe(false);
    expect(rejected.some((r) => /john/i.test(r.name))).toBe(true);
  });

  it('rejects about/nav chrome labels', () => {
    const { offerings } = extractOfferingsFromPageHtml({
      html: '<html><body><h2>Who we are</h2><h2>My Account</h2><h2>Audit & Assurance</h2></body></html>',
      pageUrl: 'https://firm.example/services',
      pageType: PAGE_TYPES.SERVICE_COLLECTION,
      businessName: 'Deloitte',
      vertical: 'professional',
    });
    const names = offerings.map((o) => o.name.toLowerCase());
    expect(names.some((n) => n.includes('who we are'))).toBe(false);
    expect(names.some((n) => n.includes('my account'))).toBe(false);
    expect(names.some((n) => n.includes('audit'))).toBe(true);
  });

  it('extracts SPA meta capability phrases for Hireup-like shells', () => {
    const spa = `
      <html><head>
        <title>Find Local Support Workers | Disability &amp; Aged Care Support | Hireup</title>
        <meta name="description" content="Hireup connects people looking for disability or aged care support with verified support workers." />
      </head><body><div id="root"></div></body></html>
    `;
    const { offerings } = extractOfferingsFromPageHtml({
      html: spa,
      pageUrl: 'https://hireup.com.au/',
      pageType: PAGE_TYPES.OTHER,
      businessName: 'Hireup',
      vertical: 'disability',
    });
    const names = offerings.map((o) => o.name.toLowerCase()).join(' | ');
    expect(names).toMatch(/support worker/);
    expect(names).toMatch(/disability|aged care/);
  });
});

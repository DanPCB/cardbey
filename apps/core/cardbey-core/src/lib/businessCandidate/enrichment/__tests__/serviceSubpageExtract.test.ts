import { describe, expect, it } from 'vitest';
import { detectServiceLinks } from '../serviceSubpageExtract.js';

describe('Service sub-page detection', () => {
  it('detects service links from nav dropdown', () => {
    const html = `
      <nav>
        <a href="#">Services</a>
        <ul>
          <li><a href="/mergers-acquisitions-advisory/">M&A Advisory</a></li>
          <li><a href="/capital-structuring-advisory/">Capital Structuring</a></li>
          <li><a href="/business-valuation-advisory/">Business Valuation</a></li>
        </ul>
      </nav>
    `;
    const services = detectServiceLinks(html, 'https://anisoncapitalgroup.com.au');
    expect(services.length).toBe(3);
    expect(services[0].name).toBe('M&A Advisory');
    expect(services[0].url).toContain('/mergers-acquisitions-advisory/');
  });

  it('does not detect nav-level items as services', () => {
    const html = `<nav><a href="/about">About</a><a href="/contact">Contact</a></nav>`;
    const services = detectServiceLinks(html, 'https://example.com');
    expect(services.length).toBe(0);
  });

  it('caps at 8 services to respect fetch budget', () => {
    const links = Array.from({ length: 12 }, (_, i) => `<a href="/service-${i}/">Service ${i}</a>`).join(
      '',
    );
    const html = `<nav><div class="services">${links}</div></nav>`;
    const services = detectServiceLinks(html, 'https://example.com');
    expect(services.length).toBeLessThanOrEqual(8);
  });
});

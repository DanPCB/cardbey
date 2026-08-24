import { describe, expect, it } from 'vitest';
import {
  extractCatalogItems,
  extractEmail,
  extractPhone,
  isContactString,
  isNavItem,
} from '../webExtractors.js';

describe('Nav item filter', () => {
  it('blocks exact nav labels', () => {
    expect(isNavItem('About')).toBe(true);
    expect(isNavItem('CONTACT US')).toBe(true);
    expect(isNavItem('Blog')).toBe(true);
    expect(isNavItem('Sign In')).toBe(true);
  });

  it('blocks phone numbers', () => {
    expect(isNavItem('+61 (0) 2 1234 5678')).toBe(true);
    expect(isNavItem('+61 3 9000 0000')).toBe(true);
  });

  it('blocks email addresses', () => {
    expect(isNavItem('contact@pactora.com.au')).toBe(true);
    expect(isNavItem('hello@cardbey.com')).toBe(true);
  });

  it('allows real service names', () => {
    expect(isNavItem('Mergers & Acquisitions Advisory')).toBe(false);
    expect(isNavItem('Capital Structuring')).toBe(false);
    expect(isNavItem('Yoga 213')).toBe(false);
    expect(isNavItem('Hair By Sarah')).toBe(false);
  });
});

describe('Contact extraction', () => {
  it('extracts phone from tel: href', () => {
    const html = '<a href="tel:+61299991234">Call us</a>';
    expect(extractPhone(html)).toBe('+61299991234');
  });

  it('extracts email from mailto: href', () => {
    const html = '<a href="mailto:contact@pactora.com.au">Email</a>';
    expect(extractEmail(html)).toBe('contact@pactora.com.au');
  });

  it('does not put phone in catalog items', () => {
    const mockHtml = `
      <nav>
        <a href="tel:+61299991234">+61 2 9999 1234</a>
        <a href="/about">About</a>
        <a href="/services/ma">M&A Advisory</a>
      </nav>
      <main><h2>Our Services</h2><ul><li>M&A Advisory</li></ul></main>
    `;
    const result = extractCatalogItems(mockHtml);
    expect(result.some((i) => isContactString(i.name))).toBe(false);
    expect(result.some((i) => isNavItem(i.name))).toBe(false);
    expect(result.some((i) => /advisory/i.test(i.name))).toBe(true);
  });
});

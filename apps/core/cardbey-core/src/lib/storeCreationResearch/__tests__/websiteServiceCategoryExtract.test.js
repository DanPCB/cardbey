import { describe, it, expect } from 'vitest';
import { extractServiceCategoryLinksFromHtml } from '../websiteMenuHtmlExtract.js';

const MSD_NAV_HTML = `
<html><body>
  <nav>
    <a href="/">HOME</a>
    <a href="/about">ABOUT US</a>
    <ul class="dropdown products-menu">
      <li><a href="/plantation-shutters-melbourne">Plantation Shutters Melbourne</a></li>
      <li><a href="/fly-doors">Fly Doors</a></li>
      <li><a href="/fly-screen">Fly Screen</a></li>
      <li><a href="/security-windows">Security Windows</a></li>
      <li><a href="/convert-manual">Convert manual to electric Rollershutter</a></li>
      <li><a href="/sheer">Sheer & Curtain</a></li>
      <li><a href="/security-doors">Security Doors & Screen</a></li>
      <li><a href="/roller-shutters">Roller Shutters</a></li>
      <li><a href="/roller-blinds">Roller Blinds</a></li>
      <li><a href="/glass-door">Glass Door Melbourne</a></li>
    </ul>
  </nav>
  <div class="product-categories">
    <h2>PRODUCT CATEGORIES</h2>
    <ul>
      <li>PLANTATION SHUTTERS MELBOURNE</li>
      <li>FLY DOORS</li>
      <li>ROLLER SHUTTERS</li>
    </ul>
  </div>
</body></html>
`;

describe('extractServiceCategoryLinksFromHtml', () => {
  it('extracts MSD-style nav categories without requiring prices', () => {
    const rows = extractServiceCategoryLinksFromHtml(MSD_NAV_HTML);
    const names = rows.map((r) => r.name.toLowerCase());
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(names.some((n) => n.includes('roller shutters'))).toBe(true);
    expect(names.some((n) => n.includes('fly doors'))).toBe(true);
    expect(names.some((n) => n.includes('security windows'))).toBe(true);
    expect(rows.every((r) => r.price === null)).toBe(true);
    expect(rows.every((r) => r.contentOrigin === 'sourced')).toBe(true);
    expect(names.some((n) => n === 'home' || n === 'about us')).toBe(false);
  });
});

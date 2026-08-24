import { describe, expect, it } from 'vitest';
import { extractDescription, extractTagline } from '../htmlUtils.js';

describe('Description extraction', () => {
  it('extracts from og:description when present', () => {
    const html =
      '<meta property="og:description" content="Anison Capital Group is a transaction-focused advisory firm.">';
    expect(extractDescription(html, null)).toBe(
      'Anison Capital Group is a transaction-focused advisory firm.',
    );
  });

  it('extracts from JSON-LD Organization', () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","description":"Advisory firm specialising in M&A."}</script>`;
    expect(extractDescription(html, null)).toContain('Advisory firm');
  });

  it('extracts from footer about block', () => {
    const html = `<footer><div class="about-us"><p>Anison Capital Group is a transaction-focused advisory firm specialising in mergers and acquisitions.</p></div></footer>`;
    const result = extractDescription(html, null);
    expect(result).toContain('transaction-focused');
  });

  it('extracts Elementor footer ABOUT US text-editor block', () => {
    const html = `<footer>
      <h2 class="elementor-heading-title">ABOUT US</h2>
      <div class="elementor-widget-text-editor">
        Anison Capital Group is a transaction-focused advisory firm specialising in mergers &amp; acquisitions, capital structuring, business growth strategy, and commercial advisory services across Australia and international markets.
      </div>
    </footer>`;
    const result = extractDescription(html, null);
    expect(result).toContain('transaction-focused');
    expect(result).toContain('mergers & acquisitions');
  });

  it('does not use H1 as description when H1 is a tagline', () => {
    const html =
      '<h1>Acquisitions. Capital. Growth.</h1><p>Full description here that is longer than 40 chars for extraction.</p>';
    const tagline = extractTagline(html);
    expect(tagline).toBe('Acquisitions. Capital. Growth.');
  });

  it('returns null when no description found (do not invent)', () => {
    const html = '<html><body><nav>About</nav></body></html>';
    expect(extractDescription(html, null)).toBeNull();
  });
});

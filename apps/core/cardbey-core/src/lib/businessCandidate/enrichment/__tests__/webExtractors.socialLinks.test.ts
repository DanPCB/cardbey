import { describe, expect, it } from 'vitest';
import { extractSocialLinks, isSocialShareButton } from '../socialLinkExtract.js';

describe('Social link extraction', () => {
  it('extracts all social platforms from HTML', () => {
    const html = `
      <header>
        <a href="https://www.facebook.com/anisoncapital">FB</a>
        <a href="https://www.instagram.com/anisoncapital">IG</a>
        <a href="https://x.com/anisoncapital">X</a>
        <a href="https://www.youtube.com/channel/xyz">YT</a>
      </header>
      <footer>
        <a href="https://www.linkedin.com/company/anisoncapital">LI</a>
        <a href="https://www.pinterest.com.au/anisoncapital">PT</a>
      </footer>
    `;
    const result = extractSocialLinks(html);
    expect(result.facebook).toBe('https://www.facebook.com/anisoncapital');
    expect(result.instagram).toBe('https://www.instagram.com/anisoncapital');
    expect(result.twitter).toBe('https://x.com/anisoncapital');
    expect(result.youtube).toContain('youtube.com');
    expect(result.linkedin).toContain('linkedin.com');
    expect(result.pinterest).toContain('pinterest.com');
  });

  it('deduplicates when same platform appears in header and footer', () => {
    const html = `
      <header><a href="https://facebook.com/anison">FB</a></header>
      <footer><a href="https://facebook.com/anison">FB again</a></footer>
    `;
    const result = extractSocialLinks(html);
    expect(Object.keys(result).filter((k) => k === 'facebook').length).toBe(1);
  });

  it('ignores share buttons (not profile links)', () => {
    const html = `<a href="https://www.facebook.com/sharer/sharer.php?u=https://example.com">Share</a>
      <a href="http://www.facebook.com/share.php?u=https://example.com&title=X">Share2</a>
      <a href="http://twitter.com/home?status=Hello">Tweet</a>`;
    const result = extractSocialLinks(html);
    expect(result.facebook).toBeUndefined();
    expect(result.twitter).toBeUndefined();
    expect(isSocialShareButton('https://www.facebook.com/sharer/sharer.php?u=x')).toBe(true);
  });

  it('extracts icon-only Elementor/Divi anchors (href + i/svg, no text)', () => {
    const html = `
      <a class="elementor-icon elementor-social-icon elementor-social-icon-facebook" href="https://www.facebook.com/anisoncapital" target="_blank">
        <span class="elementor-screen-only">Facebook</span>
        <svg class="e-fab-facebook"></svg>
      </a>
      <a href="https://www.linkedin.com/company/anisoncapital"><i class="fa fa-linkedin"></i></a>
      <a class="et-social-instagram" href="//instagram.com/anisoncapital"><i></i></a>
    `;
    const result = extractSocialLinks(html);
    expect(result.facebook).toBe('https://www.facebook.com/anisoncapital');
    expect(result.linkedin).toContain('linkedin.com/company/anisoncapital');
    expect(result.instagram).toContain('instagram.com/anisoncapital');
  });

  it('does not invent URLs when Elementor icons have no href', () => {
    const html = `
      <a class="elementor-icon elementor-social-icon elementor-social-icon-facebook" target="_blank">
        <span class="elementor-screen-only">Facebook</span>
        <svg></svg>
      </a>
    `;
    expect(extractSocialLinks(html).facebook).toBeUndefined();
  });
});

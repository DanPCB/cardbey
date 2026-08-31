import { describe, expect, it } from 'vitest';
import {
  classifyAndExtractTikTokTagHtml,
  classifyTikTokTagResponse,
  extractTikTokProfileUrls,
  resolveTikTokHashtag,
} from '../sources/tiktokHashtagResolver.js';

const BOT_SHELL = `<!DOCTYPE html><html><head>
<title>TikTok - Make Your Day</title>
<script id="tiktok-environment">{"mssdk":{"js":"https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/webmssdk/1.0.0.388/webmssdk.js"}}</script>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"seo.abtest":{"canonical":"https://www.tiktok.com/tag/bakery","vidList":[]}}}</script>
</head><body></body></html>`;

const WITH_PROFILES = `<!DOCTYPE html><html><head><title>#bakery on TikTok</title></head>
<body>
<a href="https://www.tiktok.com/@bakeryhouse.au">x</a>
<a href="https://www.tiktok.com/@bakeryhouse.au/video/1">y</a>
<script>{"uniqueId":"melbourne.cakes","itemList":[]}</script>
</body></html>`;

describe('extractTikTokProfileUrls', () => {
  it('dedupes href and uniqueId handles', () => {
    const urls = extractTikTokProfileUrls(WITH_PROFILES);
    expect(urls).toContain('https://www.tiktok.com/@bakeryhouse.au');
    expect(urls).toContain('https://www.tiktok.com/@melbourne.cakes');
    expect(urls.filter((u) => u.includes('bakeryhouse.au'))).toHaveLength(1);
  });
});

describe('classifyTikTokTagResponse', () => {
  it('classifies MSSDK shell with empty vidList as BOT_SHELL', () => {
    expect(classifyTikTokTagResponse(BOT_SHELL, { httpStatus: 200, profileCount: 0 })).toBe(
      'BOT_SHELL',
    );
  });

  it('classifies pages with profiles as NORMAL_PAGE', () => {
    expect(classifyTikTokTagResponse(WITH_PROFILES, { profileCount: 2 })).toBe('NORMAL_PAGE');
  });
});

describe('classifyAndExtractTikTokTagHtml', () => {
  it('maps bot shell to PROVIDER_BLOCKED without inventing URLs', () => {
    const r = classifyAndExtractTikTokTagHtml({
      tag: 'bakery',
      tagUrl: 'https://www.tiktok.com/tag/bakery',
      html: BOT_SHELL,
      httpStatus: 200,
    });
    expect(r.status).toBe('PROVIDER_BLOCKED');
    expect(r.urls).toEqual([]);
    expect(r.classification).toBe('BOT_SHELL');
  });

  it('returns OK with profile URLs when SSR content is present', () => {
    const r = classifyAndExtractTikTokTagHtml({
      tag: 'bakery',
      tagUrl: 'https://www.tiktok.com/tag/bakery',
      html: WITH_PROFILES,
      httpStatus: 200,
      maxUrls: 10,
    });
    expect(r.status).toBe('OK');
    expect(r.urls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('resolveTikTokHashtag', () => {
  it('propagates 429 as RATE_LIMITED', async () => {
    const r = await resolveTikTokHashtag('bakery', {
      fetchImpl: async () => ({
        status: 429,
        ok: false,
        headers: { get: () => 'text/html' },
        text: async () => '',
      }),
    });
    expect(r.status).toBe('RATE_LIMITED');
    expect(r.urls).toEqual([]);
  });

  it('uses fetchImpl HTML body', async () => {
    const r = await resolveTikTokHashtag('bakery', {
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        headers: { get: () => 'text/html' },
        text: async () => BOT_SHELL,
      }),
    });
    expect(r.status).toBe('PROVIDER_BLOCKED');
  });
});

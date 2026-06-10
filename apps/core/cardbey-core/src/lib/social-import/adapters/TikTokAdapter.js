/**
 * TikTokAdapter
 *
 * Extracts public profile data from a TikTok profile URL. TikTok exposes
 * OpenGraph tags for public profiles (og:title = display name, og:description =
 * bio). Video/product extraction requires authenticated APIs and is out of
 * scope for the first version — this adapter captures the brand identity so the
 * store can be pre-created, then degrades to the @handle from the URL.
 */

import {
  fetchHtml,
  renderHtmlWithBrowser,
  extractMetaContent,
  extractTitle,
} from '../scrapeUtils.js';

export const platform = 'tiktok';

export function matches(url) {
  if (typeof url !== 'string') return false;
  return url.toLowerCase().includes('tiktok.com');
}

export async function extract(url) {
  const sourceUrl = String(url || '').trim();
  let html = await fetchHtml(sourceUrl);
  if (!html) {
    html = await renderHtmlWithBrowser(sourceUrl);
  }

  const handle = handleFromUrl(sourceUrl);
  const businessName =
    stripTikTokSuffix(extractMetaContent(html, 'og:title')) ||
    stripTikTokSuffix(extractTitle(html)) ||
    handle ||
    '';
  const description = extractMetaContent(html, 'og:description') || '';
  const image = extractMetaContent(html, 'og:image');

  return {
    platform,
    sourceUrl,
    businessName,
    description,
    category: '',
    location: '',
    hours: '',
    contact: { phone: '', email: '', website: '' },
    profilePhoto: image,
    coverPhoto: image,
    photos: image ? [image] : [],
    posts: [],
    products: [],
    socialLinks: { tiktok: sourceUrl },
  };
}

function stripTikTokSuffix(title) {
  if (!title) return '';
  return title.replace(/\s*[-–|]\s*TikTok\s*$/i, '').replace(/\son TikTok$/i, '').trim();
}

function handleFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/@([^/]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]).replace(/[._-]+/g, ' ').trim();
  } catch {
    /* not parseable */
  }
  return '';
}

export default { platform, matches, extract };

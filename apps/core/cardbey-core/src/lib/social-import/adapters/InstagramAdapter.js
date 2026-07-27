/**
 * InstagramAdapter
 *
 * Extracts public profile data from an Instagram profile URL. Public profiles
 * expose OpenGraph tags (og:title, og:description = bio, og:image = avatar).
 * Post/caption extraction requires authenticated access and is out of scope for
 * the first version. Degrades to the @handle parsed from the URL.
 */

import {
  fetchHtml,
  renderHtmlWithBrowser,
  extractMetaContent,
  extractTitle,
} from '../scrapeUtils.js';

export const platform = 'instagram';

export function matches(url) {
  if (typeof url !== 'string') return false;
  return url.toLowerCase().includes('instagram.com');
}

export async function extract(url) {
  const sourceUrl = String(url || '').trim();
  let html = await fetchHtml(sourceUrl);
  if (!html) {
    html = await renderHtmlWithBrowser(sourceUrl);
  }

  const handle = handleFromUrl(sourceUrl);
  const businessName =
    stripInstagramSuffix(extractMetaContent(html, 'og:title')) ||
    stripInstagramSuffix(extractTitle(html)) ||
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
    socialLinks: { instagram: sourceUrl },
  };
}

function stripInstagramSuffix(title) {
  if (!title) return '';
  return title
    .replace(/\s*[-–|]\s*Instagram\s*(photos and videos)?\s*$/i, '')
    .replace(/\s*\(@[^)]+\).*$/i, '')
    .trim();
}

function handleFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0] || '';
    if (!seg) return '';
    return decodeURIComponent(seg.replace(/^@/, '')).replace(/[._-]+/g, ' ').trim();
  } catch {
    return '';
  }
}

export default { platform, matches, extract };

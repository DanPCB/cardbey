/**
 * FacebookAdapter
 *
 * Extracts public data from a Facebook Page URL. Public Pages expose OpenGraph
 * tags (og:title, og:description, og:image) and sometimes JSON-LD. Facebook is
 * aggressive about login walls, so this adapter is best-effort and degrades to
 * the page handle parsed from the URL when no metadata is available.
 */

import {
  fetchHtml,
  renderHtmlWithBrowser,
  extractMetaContent,
  extractTitle,
  extractJsonLd,
  jsonLdTypeIncludes,
} from '../scrapeUtils.js';

export const platform = 'facebook';

export function matches(url) {
  if (typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return u.includes('facebook.com') || u.includes('fb.com') || u.includes('fb.me');
}

export async function extract(url) {
  const sourceUrl = String(url || '').trim();
  let html = await fetchHtml(sourceUrl);
  if (!html) {
    html = await renderHtmlWithBrowser(sourceUrl);
  }

  const jsonLd = extractJsonLd(html);
  const node =
    jsonLd.find((n) => jsonLdTypeIncludes(n, 'LocalBusiness') || jsonLdTypeIncludes(n, 'Organization')) || null;

  const handle = handleFromUrl(sourceUrl);
  const businessName =
    pickString(node?.name) ||
    stripFacebookSuffix(extractMetaContent(html, 'og:title')) ||
    stripFacebookSuffix(extractTitle(html)) ||
    handle ||
    '';

  const description =
    pickString(node?.description) || extractMetaContent(html, 'og:description') || '';
  const image = extractMetaContent(html, 'og:image');
  const phone = pickString(node?.telephone);
  const website = pickString(node?.url) && !/facebook\.com/i.test(node.url) ? node.url : '';

  return {
    platform,
    sourceUrl,
    businessName,
    description,
    category: resolveCategory(node),
    location: resolveAddress(node),
    hours: '',
    contact: { phone, email: pickString(node?.email), website },
    profilePhoto: image,
    coverPhoto: image,
    photos: image ? [image] : [],
    posts: [],
    products: [],
    socialLinks: { facebook: sourceUrl },
  };
}

function pickString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function stripFacebookSuffix(title) {
  if (!title) return '';
  return title.replace(/\s*[-–|]\s*Facebook\s*$/i, '').trim();
}

function handleFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0] || '';
    if (!seg || seg === 'profile.php' || seg === 'pages') return '';
    return decodeURIComponent(seg).replace(/[._-]+/g, ' ').trim();
  } catch {
    return '';
  }
}

function resolveCategory(node) {
  const t = node?.['@type'];
  if (typeof t === 'string' && t.toLowerCase() !== 'organization') return t;
  if (Array.isArray(t)) {
    const specific = t.find((x) => String(x).toLowerCase() !== 'organization');
    if (specific) return String(specific);
  }
  return '';
}

function resolveAddress(node) {
  const addr = node?.address;
  if (typeof addr === 'string') return addr.trim();
  if (addr && typeof addr === 'object') {
    return [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry]
      .filter((p) => typeof p === 'string' && p.trim())
      .join(', ');
  }
  return '';
}

export default { platform, matches, extract };

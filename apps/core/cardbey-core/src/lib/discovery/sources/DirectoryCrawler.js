/**
 * DirectoryCrawler — extract outbound business website URLs from directory listing pages.
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';

const FETCH_TIMEOUT_MS = 15_000;

const SOCIAL_HOSTS = [
  'tiktok.com',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'linkedin.com',
  'pinterest.com',
];

const DIRECTORY_PATH_PATTERNS = [
  /\/biz\//i,
  /\/company\//i,
  /\/business\//i,
];

/**
 * @param {string} directoryUrl
 * @param {number} [limit]
 * @returns {Promise<string[]>}
 */
export async function extractBusinessUrls(directoryUrl, limit = 20) {
  const max = Math.max(1, Math.min(Number(limit) || 20, 100));
  const source = typeof directoryUrl === 'string' ? directoryUrl.trim() : '';
  if (!source.startsWith('http')) return [];

  try {
    const html = await fetchHtml(source, { timeoutMs: FETCH_TIMEOUT_MS });
    if (!html) return [];

    let directoryHost = '';
    try {
      directoryHost = new URL(source).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return [];
    }

    const hrefs = extractAnchorHrefs(html);
    const businessUrls = [];
    const seen = new Set();

    for (const href of hrefs) {
      const absolute = toAbsoluteUrl(href, source);
      if (!absolute || !absolute.startsWith('http')) continue;
      if (!isLikelyBusinessSite(absolute, directoryHost, source)) continue;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      businessUrls.push(absolute);
      if (businessUrls.length >= max) break;
    }

    return businessUrls;
  } catch {
    return [];
  }
}

function extractAnchorHrefs(html) {
  const hrefs = [];
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (match[1]) hrefs.push(match[1].trim());
  }
  return hrefs;
}

function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyBusinessSite(url, directoryHost, directoryUrl) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  if (!host) return false;

  const lowerUrl = url.toLowerCase();
  if (SOCIAL_HOSTS.some((h) => host.includes(h))) return false;

  const lowerDirectory = directoryUrl.toLowerCase();
  const isKnownDirectory =
    lowerDirectory.includes('yellowpages.com.au') ||
    lowerDirectory.includes('truelocal.com.au') ||
    lowerDirectory.includes('yelp.com.au') ||
    lowerDirectory.includes('hotfrog.com.au');

  if (host === directoryHost || host.endsWith(`.${directoryHost}`)) {
    if (isKnownDirectory) {
      const path = parsed.pathname.toLowerCase();
      return DIRECTORY_PATH_PATTERNS.some((re) => re.test(path));
    }
    return false;
  }

  if (isKnownDirectory) {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }

  const path = parsed.pathname;
  const hasMeaningfulPath = path && path !== '/' && path.length > 1;
  const isRootDomain = !hasMeaningfulPath || /^\/[a-z0-9-]+\/?$/i.test(path);
  return isRootDomain || hasMeaningfulPath;
}

export default { extractBusinessUrls };

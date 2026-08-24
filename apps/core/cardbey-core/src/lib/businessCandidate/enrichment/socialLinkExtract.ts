/**
 * Social profile URL extraction from page HTML (header + footer).
 * Filters share-intent buttons — profile URLs only.
 *
 * Page builders (Elementor / Divi / Beaver) often render icon-only anchors:
 *   <a href="https://facebook.com/…"><i class="fa fa-facebook"></i></a>
 * or Elementor SVG icons with empty visible text. Href is still extractable.
 *
 * Note: some misconfigured Elementor widgets omit href entirely (Anison live);
 * without a URL we cannot invent a profile — platform class alone is not enough.
 */

export type SocialLinks = {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  pinterest?: string;
  snapchat?: string;
};

const SOCIAL_DOMAIN_MAP: Record<string, keyof SocialLinks> = {
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'fb.me': 'facebook',
  'instagram.com': 'instagram',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'linkedin.com': 'linkedin',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tiktok.com': 'tiktok',
  'pinterest.com': 'pinterest',
  'pinterest.com.au': 'pinterest',
  'snapchat.com': 'snapchat',
};

const SOCIAL_SHARE_PATTERNS = [
  /sharer\.php/i,
  /share\.php/i,
  /share\?/i,
  /shareArticle/i,
  /intent\/tweet/i,
  /AddToAny/i,
  /\/share\//i,
  /dialog\/share/i,
  /home\?status=/i,
  /[?&]u=https?:\/\//i, // facebook/linkedin share query payloads
];

/** Icon-only anchors: children are only i/span/svg (or whitespace) — Elementor/Divi/Beaver. */
const ICON_ONLY_ANCHOR_HREF =
  /<a[^>]+href=["']([^"']+)["'][^>]*>\s*(?:<(?:i|span|svg)[^>]*>[\s\S]*?<\/(?:i|span|svg)>|\s)*\s*<\/a>/gi;

export function isSocialShareButton(url: string): boolean {
  return SOCIAL_SHARE_PATTERNS.some((p) => p.test(url));
}

/**
 * Prefer profile-like paths; reject bare domains and share intents.
 */
function looksLikeProfileUrl(url: string, platform: keyof SocialLinks): boolean {
  if (isSocialShareButton(url)) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    if (!path || path === '') return false;
    if (platform === 'youtube') {
      return /\/(channel|user|c|@)[\w-]+/i.test(path) || path.length > 1;
    }
    if (platform === 'linkedin') {
      return /\/(company|in|school)\//i.test(path);
    }
    return path.split('/').filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

function hostnameToPlatform(hostname: string): keyof SocialLinks | null {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  if (SOCIAL_DOMAIN_MAP[host]) return SOCIAL_DOMAIN_MAP[host];
  for (const [domain, platform] of Object.entries(SOCIAL_DOMAIN_MAP)) {
    if (host === domain || host.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

/** Normalize protocol-relative and http(s) hrefs to absolute https URLs. */
export function normalizeHrefUrl(raw: string, baseUrl?: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.startsWith('#') || /^(javascript|mailto|tel):/i.test(trimmed)) {
    return null;
  }
  try {
    if (/^\/\//.test(trimmed)) {
      return new URL(`https:${trimmed}`).href;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).href;
    }
    if (baseUrl) {
      return new URL(trimmed, baseUrl).href;
    }
  } catch {
    return null;
  }
  return null;
}

function considerUrl(links: SocialLinks, rawUrl: string): void {
  const url = normalizeHrefUrl(rawUrl);
  if (!url || isSocialShareButton(url)) return;
  try {
    const hostname = new URL(url).hostname;
    const platform = hostnameToPlatform(hostname);
    if (platform && !links[platform] && looksLikeProfileUrl(url, platform)) {
      links[platform] = url;
    }
  } catch {
    /* skip malformed */
  }
}

/**
 * Elementor/Divi often put class before or after href; capture either order when
 * the anchor is a known social icon class AND has an href.
 */
function extractBuilderIconAnchors(html: string): string[] {
  const out: string[] = [];
  const patterns = [
    /<a\b(?=[^>]*\b(?:elementor-social-icon|et-social-|social-icon)[^>]*)(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi,
    /<a\b(?=[^>]*\bhref=["']([^"']+)["'])(?=[^>]*\b(?:elementor-social-icon|et-social-|social-icon)[^>]*)[^>]*>/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      if (m[1]) out.push(m[1]);
    }
  }
  return out;
}

export function extractSocialLinks(html: string): SocialLinks {
  const links: SocialLinks = {};
  const raw = String(html ?? '');

  // 1) All http(s) and protocol-relative hrefs
  const allHrefs = [...raw.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const href of allHrefs) {
    considerUrl(links, href);
  }

  // 2) Explicit icon-only anchors (i/span/svg children) — page-builder pattern
  for (const m of raw.matchAll(ICON_ONLY_ANCHOR_HREF)) {
    considerUrl(links, m[1]);
  }

  // 3) Builder social-icon class + href (any attribute order)
  for (const href of extractBuilderIconAnchors(raw)) {
    considerUrl(links, href);
  }

  return links;
}

/** Convert SocialLinks map → candidate socialLinks array shape. */
export function socialLinksToCandidateArray(
  links: SocialLinks,
): Array<{ platform: string; url: string }> {
  return (Object.entries(links) as Array<[string, string | undefined]>)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([platform, url]) => ({ platform, url }));
}

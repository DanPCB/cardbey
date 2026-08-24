/**
 * Social profile URL extraction from page HTML (header + footer).
 * Filters share-intent buttons — profile URLs only.
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
    // youtube channel/user/watch-ish profiles
    if (platform === 'youtube') {
      return /\/(channel|user|c|@)[\w-]+/i.test(path) || path.length > 1;
    }
    // linkedin company/in
    if (platform === 'linkedin') {
      return /\/(company|in|school)\//i.test(path);
    }
    // generic: path has a slug
    return path.split('/').filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

function hostnameToPlatform(hostname: string): keyof SocialLinks | null {
  const host = hostname.replace(/^www\./i, '').toLowerCase();
  if (SOCIAL_DOMAIN_MAP[host]) return SOCIAL_DOMAIN_MAP[host];
  // subdomain match e.g. au.linkedin.com
  for (const [domain, platform] of Object.entries(SOCIAL_DOMAIN_MAP)) {
    if (host === domain || host.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

export function extractSocialLinks(html: string): SocialLinks {
  const links: SocialLinks = {};
  const allHrefs = [...String(html ?? '').matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((url) => /^https?:\/\//i.test(url));

  for (const url of allHrefs) {
    if (isSocialShareButton(url)) continue;
    try {
      const hostname = new URL(url).hostname;
      const platform = hostnameToPlatform(hostname);
      if (platform && !links[platform] && looksLikeProfileUrl(url, platform)) {
        links[platform] = url;
      }
    } catch {
      /* skip malformed URLs */
    }
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

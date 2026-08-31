/**
 * Website + public social/aggregator extractors (Tier 1 / 3).
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';
import { sanitizeEnrichmentText } from '../../businessIngestion/enrichmentSafety.js';
import type { EnrichmentBudget } from './budget.js';
import {
  absoluteUrl,
  extractJsonLdLocalBusiness,
  firstHeading,
  isHttpUrl,
  metaContent,
  navLabels,
  stripHtmlToText,
} from './htmlUtils.js';

const NAV_CHROME =
  /^(home|about|about us|contact|contact us|services|products|blog|news|faq|login|sign in|sign up|menu|gallery|book now|get a quote)$/i;

/** True when a nav/catalog label is chrome rather than a service offering. */
export function isNavItem(label: string): boolean {
  return NAV_CHROME.test(String(label ?? '').trim());
}

/** Collect raw tel: href values (debug + primary extract). */
export function listTelHrefs(html: string): string[] {
  return [...String(html ?? '').matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => m[1]);
}

export function extractPhone(html: string): string | null {
  const telHrefs = listTelHrefs(html);
  for (const raw of telHrefs) {
    const cleaned = String(raw).replace(/[^\d+]/g, '');
    if (cleaned.length >= 8) return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  const footerMatch = html.match(
    /<footer[^>]*>[\s\S]*?(\+\d[\d\s\-().]{7,})[\s\S]*?<\/footer>/i,
  );
  if (footerMatch?.[1] && !/xxx/i.test(footerMatch[1])) return footerMatch[1].trim();

  const pageMatch = html.match(/(\+\d{1,3}[\d\s\-().Xx]{7,})/);
  if (pageMatch?.[1] && !/xxx/i.test(pageMatch[1])) return pageMatch[1].trim();

  // AU mobiles / landlines without country code (e.g. 0420 435 238)
  const auLocal = html.match(/(?:\+?61\s*)?(0[2-478](?:[\s-]?\d){8})\b/);
  if (auLocal?.[1] && !/xxx/i.test(auLocal[1])) {
    return auLocal[1].replace(/\s+/g, ' ').trim();
  }

  return null;
}

/** Email: mailto: href first, then footer/page text. */
export function extractEmail(html: string): string | null {
  const mailMatch = html.match(/href=["']mailto:([^"'?]+)/i);
  if (mailMatch?.[1]) return mailMatch[1].trim();

  const footerEmailMatch = html.match(
    /<footer[^>]*>[\s\S]*?([^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+)[\s\S]*?<\/footer>/i,
  );
  if (footerEmailMatch?.[1]) return footerEmailMatch[1].trim();

  const pageEmail = html.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
  if (pageEmail?.[1] && !/example\.(com|org)/i.test(pageEmail[1])) {
    return pageEmail[1].trim();
  }

  return null;
}

/**
 * Australian street address ? JSON-LD PostalAddress, then footer/page AU patterns.
 */
export function extractAddress(html: string): string | null {
  const source = String(html ?? '');
  const jsonLdBlocks = [
    ...source.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const nodes = Array.isArray(data) ? data : data?.['@graph'] ? data['@graph'] : [data];
      for (const node of nodes) {
        const addr = node?.address ?? node?.location?.address;
        if (!addr) continue;
        if (typeof addr === 'string' && addr.trim().length > 8) return addr.trim();
        if (addr.streetAddress) {
          return [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
            .filter(Boolean)
            .join(', ');
        }
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }

  const auAddressPattern =
    /\d{1,4}\s+[A-Za-z][A-Za-z0-9\s.'-]+(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Pl|Place|Cres|Crescent|Hwy|Highway)\.?,?\s+[A-Za-z][A-Za-z\s'-]+,?\s+(?:VIC|NSW|QLD|SA|WA|TAS|ACT|NT)\b(?:\s*\d{4})?/gi;

  const footer = source.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  if (footer?.[1]) {
    const footerMatch = footer[1].match(auAddressPattern);
    if (footerMatch?.[0]) return footerMatch[0].replace(/\s+/g, ' ').trim();
  }

  const pageMatch = source.match(auAddressPattern);
  if (pageMatch?.[0]) return pageMatch[0].replace(/\s+/g, ' ').trim();

  return null;
}

export type WebsiteExtract = {
  title: string | null;
  description: string | null;
  ogImage: string | null;
  heading: string | null;
  navItems: string[];
  openingHours: string | null;
  telephone: string | null;
  email: string | null;
  address: string | null;
  sourceUrl: string;
  pageText: string;
  /** Raw HTML — in-memory only during enrichment (not persisted). */
  html: string;
};

const SOCIAL_PATTERNS: Array<{ platform: string; re: RegExp }> = [
  { platform: 'facebook', re: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/i },
  { platform: 'instagram', re: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/i },
  { platform: 'tiktok', re: /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>]+/i },
  { platform: 'linkedin', re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>]+/i },
  { platform: 'youtube', re: /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|@)[^\s"'<>]+/i },
  {
    platform: 'whatsapp',
    re: /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<>]+/i,
  },
];

/** Extract social profile URLs from website header/footer links. */
export function extractSocialLinksFromHtml(
  html: string,
): Array<{ platform: string; url: string }> {
  const found = new Map<string, string>();
  for (const { platform, re } of SOCIAL_PATTERNS) {
    const match = String(html ?? '').match(re);
    if (match?.[0]) found.set(platform, match[0].replace(/[),.;]+$/, ''));
  }
  return [...found.entries()].map(([platform, url]) => ({ platform, url }));
}

export async function extractFromBusinessWebsite(
  budget: EnrichmentBudget,
  websiteUrl: string,
): Promise<WebsiteExtract | null> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  budget.consumeFetch();
  const html = await fetchHtml(url, { timeoutMs: 10000 });
  if (!html) return null;

  const jsonLd = extractJsonLdLocalBusiness(html);
  const ogDescription = metaContent(html, 'og:description');
  const metaDescription = metaContent(html, 'description');
  const ogImageRaw = metaContent(html, 'og:image');
  const ogImage =
    ogImageRaw && isHttpUrl(ogImageRaw)
      ? ogImageRaw
      : ogImageRaw
        ? absoluteUrl(url, ogImageRaw)
        : null;

  let openingHours: string | null = null;
  if (jsonLd?.openingHours) {
    openingHours = Array.isArray(jsonLd.openingHours)
      ? jsonLd.openingHours.map(String).join('; ')
      : String(jsonLd.openingHours);
  } else if (jsonLd?.openingHoursSpecification) {
    openingHours = JSON.stringify(jsonLd.openingHoursSpecification).slice(0, 500);
  }

  const description =
    sanitizeEnrichmentText(
      String(jsonLd?.description ?? ogDescription ?? metaDescription ?? ''),
    ) ?? null;

  let telephone =
    extractPhone(html) ||
    (jsonLd?.telephone ? String(jsonLd.telephone).replace(/\s/g, '') : null);
  let email = extractEmail(html);
  let address = extractAddress(html);

  // Thin homepage contact ? try common contact/about paths (budget-capped).
  if (!telephone || !email || !address) {
    const contactPaths = ['/contact', '/contact-us', '/get-in-touch', '/about', '/about-us'];
    for (const path of contactPaths) {
      if (budget.websiteFetches >= budget.maxFetches) break;
      try {
        const contactUrl = new URL(path, url).href;
        budget.consumeFetch();
        const contactHtml = await fetchHtml(contactUrl, { timeoutMs: 5000 });
        if (!contactHtml) continue;
        if (!telephone) telephone = extractPhone(contactHtml);
        if (!email) email = extractEmail(contactHtml);
        if (!address) address = extractAddress(contactHtml);
        if (telephone && email && address) break;
      } catch {
        break;
      }
    }
  }

  return {
    title: metaContent(html, 'og:title') ?? firstHeading(html),
    description,
    ogImage: ogImage && isHttpUrl(ogImage) ? ogImage : null,
    heading: firstHeading(html),
    navItems: navLabels(html),
    openingHours,
    telephone,
    email,
    address,
    sourceUrl: url,
    pageText: stripHtmlToText(html),
    html,
  };
}

export type SocialExtract = {
  platform: 'instagram' | 'facebook';
  bio: string | null;
  category: string | null;
  sourceUrl: string;
};

export async function extractPublicSocialProfile(
  budget: EnrichmentBudget,
  url: string,
  platform: 'instagram' | 'facebook',
): Promise<SocialExtract | null> {
  budget.consumeFetch();
  const html = await fetchHtml(url, { timeoutMs: 10000 });
  if (!html) return null;
  const ogDescription = metaContent(html, 'og:description');
  const ogTitle = metaContent(html, 'og:title');
  return {
    platform,
    bio: sanitizeEnrichmentText(ogDescription ?? '') ?? null,
    category: sanitizeEnrichmentText(ogTitle ?? '', 80) ?? null,
    sourceUrl: url,
  };
}

export type AggregatorExtract = {
  category: string | null;
  description: string | null;
  sourceUrl: string;
};

/** Yellow Pages AU public listing ? Tier 3 fallback when website/social thin. */
export async function extractYellowPagesSnippet(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
): Promise<AggregatorExtract | null> {
  const q = [businessName, suburb, 'Australia'].filter(Boolean).join(' ');
  const sourceUrl = `https://www.yellowpages.com.au/search/listings?clue=${encodeURIComponent(q)}`;
  budget.consumeFetch();
  const html = await fetchHtml(sourceUrl, { timeoutMs: 10000 });
  if (!html) {
    console.warn(`[YellowPages] empty/blocked response for "${businessName}"`);
    return null;
  }
  const ogDescription = metaContent(html, 'og:description');
  const text = stripHtmlToText(html, 3000);
  const snippet = sanitizeEnrichmentText(ogDescription ?? text.slice(0, 400)) ?? null;
  if (!snippet || snippet.length < 20) {
    console.warn(`[YellowPages] no usable snippet for "${businessName}"`);
    return null;
  }
  return {
    category: null,
    description: snippet,
    sourceUrl,
  };
}

/** True Local AU ? Tier 3 aggregator fallback. */
export async function extractTrueLocalSnippet(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
): Promise<AggregatorExtract | null> {
  const term = [businessName, suburb].filter(Boolean).join(' ');
  const sourceUrl = `https://www.truelocal.com.au/search?searchTerm=${encodeURIComponent(term)}&searchLocation=${encodeURIComponent(suburb ? `${suburb} VIC` : 'Melbourne VIC')}`;
  budget.consumeFetch();
  const html = await fetchHtml(sourceUrl, { timeoutMs: 10000 });
  if (!html) {
    console.warn(`[TrueLocal] empty/blocked response for "${businessName}"`);
    return null;
  }
  const ogDescription = metaContent(html, 'og:description');
  const text = stripHtmlToText(html, 3000);
  const snippet = sanitizeEnrichmentText(ogDescription ?? text.slice(0, 400)) ?? null;
  if (!snippet || snippet.length < 20) {
    console.warn(`[TrueLocal] no usable snippet for "${businessName}"`);
    return null;
  }
  return {
    category: null,
    description: snippet,
    sourceUrl,
  };
}

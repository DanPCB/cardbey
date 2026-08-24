/**
 * DATA FLOW MAP (Website Extraction Pipeline — Phase 1 first change)
 *
 * 1. webExtractors.extractFromBusinessWebsite(budget, url)
 *    - fetchHtml → parse meta/JSON-LD/nav/contact → WebsiteExtract
 *    - Writes: description, title/heading, ogImage, navItems, catalogItems,
 *      phone, email, openingHours, pageText, sourceUrl
 *
 * 2. multiSourceEnrichmentAgent.enrichCandidateMultiSource
 *    - FieldBag bag = { description?, category?, tags?, heroImageUrl?, …, phone?, email? }
 *    - STEP 2: website extract → setField(bag, description|openingHours|website|phone|email)
 *    - websiteNavItems / catalogItems feed category mapping + later catalog synthesis
 *    - PreferHigherTierField: Tier-1 website beats Tier-3 aggregators
 *
 * 3. synthesize.synthesizeDescription(budget, DescriptionInputs)
 *    - Inputs include websiteDescription from bag / extract
 *    - Claude or rule-based grounded text → bag.description
 *
 * 4. Catalog path
 *    - Phase 1+: catalogItems on WebsiteExtract (nav/contact filtered)
 *    - Downstream store-create / research may also build catalogs — must use
 *      isNavItem/isContactString before writing bookable products
 *
 * 5. heroSearchQueries.buildHeroSearchQueries ← category + suburb + name
 *    - heroImageResolve uses ladder; bad "Other … storefront" when category=Other
 *
 * Guardrails: candidate-only writes; never Business / DraftStore / BusinessSeed / User.
 */

import { fetchHtml } from '../../social-import/scrapeUtils.js';
import { sanitizeEnrichmentText } from '../../businessIngestion/enrichmentSafety.js';
import {
  extractSocialLinks,
  socialLinksToCandidateArray,
  type SocialLinks,
} from './socialLinkExtract.js';
import { decodeBasicEntities, isContactString, isNavItem } from './navItemFilter.js';
import { detectServiceLinks } from './serviceSubpageExtract.js';
import type { EnrichmentBudget } from './budget.js';
import {
  absoluteUrl,
  extractDescription,
  extractJsonLdLocalBusiness,
  extractTagline,
  firstHeading,
  isHttpUrl,
  metaContent,
  navLabels,
  stripHtmlToText,
} from './htmlUtils.js';

export { isNavItem, isContactString } from './navItemFilter.js';

// ── Contact extractors ────────────────────────────────────────────────
/** Collect raw tel: href values (debug + primary extract). */
export function listTelHrefs(html: string): string[] {
  return [...String(html ?? '').matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => m[1]);
}

export function extractPhone(html: string): string | null {
  const telHrefs = listTelHrefs(html);
  if (process.env.CARDBEY_DEBUG_EXTRACT === '1') {
    console.warn(
      '[extractPhone] first tel: hrefs:',
      telHrefs.slice(0, 5).length ? telHrefs.slice(0, 5) : '(none)',
    );
  }

  // Priority 1: href="tel:..." (incl. Elementor icon-only <a href="tel:…"><i/></a>)
  for (const raw of telHrefs) {
    const cleaned = String(raw).replace(/[^\d+]/g, '');
    if (cleaned.length >= 8) return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }

  const footerMatch = html.match(
    /<footer[^>]*>[\s\S]*?(\+\d[\d\s\-().]{7,})[\s\S]*?<\/footer>/i,
  );
  if (footerMatch?.[1] && !/xxx/i.test(footerMatch[1])) return footerMatch[1].trim();

  // Header / page visible AU-style numbers — skip privacy masks (XXX)
  const pageMatch = html.match(/(\+\d{1,3}[\d\s\-().Xx]{7,})/);
  if (pageMatch?.[1] && !/xxx/i.test(pageMatch[1])) return pageMatch[1].trim();

  return null;
}

/** Email: mailto: href first, then footer text. */
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

export type WebsiteCatalogItem = {
  name: string;
  description?: string | null;
  sourceUrl?: string | null;
};

/**
 * Candidate catalog labels from nav/main lists — never nav chrome or contact strings.
 */
export function extractCatalogItems(html: string): WebsiteCatalogItem[] {
  const labels = navLabels(html).map((l) => decodeBasicEntities(l).trim());
  const out: WebsiteCatalogItem[] = [];
  const seen = new Set<string>();
  for (const name of labels) {
    if (!name || isNavItem(name) || isContactString(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
    if (out.length >= 12) break;
  }
  return out;
}

export type WebsiteExtract = {
  title: string | null;
  description: string | null;
  tagline: string | null;
  ogImage: string | null;
  heading: string | null;
  /** Raw-ish nav labels after chrome/contact filter (category signals). */
  navItems: string[];
  /** Service/product candidates — never includes nav chrome or contact strings. */
  catalogItems: WebsiteCatalogItem[];
  phone: string | null;
  email: string | null;
  socialLinks: SocialLinks;
  openingHours: string | null;
  /** @deprecated use phone — kept for callers reading JSON-LD telephone only */
  telephone: string | null;
  sourceUrl: string;
  pageText: string;
};

export async function extractFromBusinessWebsite(
  budget: EnrichmentBudget,
  websiteUrl: string,
): Promise<WebsiteExtract | null> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  budget.consumeFetch();
  const html = await fetchHtml(url, { timeoutMs: 10000 });
  if (!html) return null;

  const jsonLd = extractJsonLdLocalBusiness(html);
  const description =
    extractDescription(html) ??
    sanitizeEnrichmentText(String(jsonLd?.description ?? '')) ??
    null;
  const tagline = extractTagline(html);
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

  const phone =
    extractPhone(html) ||
    (jsonLd?.telephone ? String(jsonLd.telephone).replace(/\s/g, '') : null);
  const email = extractEmail(html);

  const catalogFromNav = extractCatalogItems(html);
  const detectedServices = detectServiceLinks(html, url);
  const catalogItems: WebsiteCatalogItem[] = [];
  const seen = new Set<string>();
  for (const svc of detectedServices) {
    const key = svc.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    catalogItems.push({
      name: svc.name,
      sourceUrl: svc.url,
      description: svc.description ?? null,
    });
  }
  for (const item of catalogFromNav) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    catalogItems.push(item);
  }

  const socialLinks = extractSocialLinks(html);
  const navItems = navLabels(html)
    .map((l) => decodeBasicEntities(l).trim())
    .filter((t) => t && !isNavItem(t) && !isContactString(t));

  return {
    title: metaContent(html, 'og:title') ?? firstHeading(html),
    description: description ? sanitizeEnrichmentText(description, 600) : null,
    tagline,
    ogImage: ogImage && isHttpUrl(ogImage) ? ogImage : null,
    heading: tagline ?? firstHeading(html),
    navItems: [...new Set(navItems)].slice(0, 12),
    catalogItems: catalogItems.slice(0, 12),
    phone,
    email,
    socialLinks,
    openingHours,
    telephone: phone,
    sourceUrl: url,
    pageText: stripHtmlToText(html),
  };
}

export { extractSocialLinks, socialLinksToCandidateArray };

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

/** Yellow Pages AU public listing — Tier 3 fallback when website/social thin. */
export async function extractYellowPagesSnippet(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
): Promise<AggregatorExtract | null> {
  const q = [businessName, suburb, 'VIC'].filter(Boolean).join(' ');
  const sourceUrl = `https://www.yellowpages.com.au/search/listings?clue=${encodeURIComponent(q)}&locationClue=${encodeURIComponent(suburb ?? 'Melbourne VIC')}`;
  budget.consumeFetch();
  const html = await fetchHtml(sourceUrl, { timeoutMs: 10000 });
  if (!html) return null;
  const ogDescription = metaContent(html, 'og:description');
  const text = stripHtmlToText(html, 3000);
  const snippet = sanitizeEnrichmentText(ogDescription ?? text.slice(0, 400)) ?? null;
  if (!snippet || snippet.length < 20) return null;
  return {
    category: null,
    description: snippet,
    sourceUrl,
  };
}

/** True Local AU — Tier 3 aggregator fallback. */
export async function extractTrueLocalSnippet(
  budget: EnrichmentBudget,
  businessName: string,
  suburb: string | null,
): Promise<AggregatorExtract | null> {
  const term = [businessName, suburb].filter(Boolean).join(' ');
  const sourceUrl = `https://www.truelocal.com.au/search?searchTerm=${encodeURIComponent(term)}&searchLocation=${encodeURIComponent(suburb ? `${suburb} VIC` : 'Melbourne VIC')}`;
  budget.consumeFetch();
  const html = await fetchHtml(sourceUrl, { timeoutMs: 10000 });
  if (!html) return null;
  const ogDescription = metaContent(html, 'og:description');
  const text = stripHtmlToText(html, 3000);
  const snippet = sanitizeEnrichmentText(ogDescription ?? text.slice(0, 400)) ?? null;
  if (!snippet || snippet.length < 20) return null;
  return {
    category: null,
    description: snippet,
    sourceUrl,
  };
}

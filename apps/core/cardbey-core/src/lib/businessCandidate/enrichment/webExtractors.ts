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

export type WebsiteExtract = {
  title: string | null;
  description: string | null;
  ogImage: string | null;
  heading: string | null;
  navItems: string[];
  openingHours: string | null;
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

  return {
    title: metaContent(html, 'og:title') ?? firstHeading(html),
    description,
    ogImage: ogImage && isHttpUrl(ogImage) ? ogImage : null,
    heading: firstHeading(html),
    navItems: navLabels(html),
    openingHours,
    telephone: jsonLd?.telephone ? String(jsonLd.telephone) : null,
    sourceUrl: url,
    pageText: stripHtmlToText(html),
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

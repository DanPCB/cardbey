/**
 * Tier 4 hero image resolution — website og first; Pexels ladder for representative stock.
 * Never caches Google Places photos for public display.
 */

import type { EnrichmentBudget } from './budget.js';
import type { EnrichmentSourceKind } from './types.js';
import { buildHeroSearchQueries } from './heroSearchQueries.js';
import { statusResult, successResult, type SourceAdapterResult } from './sourceStatus.js';

export type HeroResolveResult = {
  url: string;
  source: EnrichmentSourceKind;
  sourceUrl: string;
  rawExtract: string;
  eligible: boolean;
  rejectionReason?: string;
};

function looksLikeLogoOrIcon(url: string): boolean {
  return /logo|icon|favicon|sprite|pixel|1x1|tracking/i.test(url);
}

async function searchPexels(
  budget: EnrichmentBudget,
  query: string,
  opts: { eligibleOnHit?: boolean } = {},
): Promise<SourceAdapterResult<HeroResolveResult>> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) {
    return statusResult('pexels', 'NOT_CONFIGURED', 'PEXELS_API_KEY missing');
  }
  budget.consumeFetch();
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`;
  try {
    const res = await fetch(url, { headers: { Authorization: key } });
    if (res.status === 401 || res.status === 403) {
      return statusResult('pexels', 'ACCESS_DENIED', `HTTP ${res.status}`);
    }
    if (res.status === 429) {
      return statusResult('pexels', 'RATE_LIMITED', 'HTTP 429');
    }
    if (!res.ok) return statusResult('pexels', 'PROVIDER_BLOCKED', `HTTP ${res.status}`);
    const json = (await res.json()) as {
      photos?: Array<{ width?: number; src?: { large2x?: string; large?: string } }>;
    };
    const photo = (json.photos ?? []).find((p) => (p.width ?? 0) >= 1200) ?? json.photos?.[0];
    const imageUrl = photo?.src?.large2x ?? photo?.src?.large;
    if (!imageUrl) return statusResult('pexels', 'NOT_FOUND', `no photos for query=${query}`);
    const eligible = opts.eligibleOnHit === true;
    return successResult(
      'pexels',
      eligible ? ['heroImageUrl'] : [],
      {
        url: imageUrl,
        source: 'pexels',
        sourceUrl: url,
        rawExtract: `query=${query};${imageUrl}`,
        eligible,
        rejectionReason: eligible
          ? undefined
          : 'stock_category_search_not_business_owned',
      },
      {
        message: eligible
          ? `Representative stock hero from Pexels (query=${query})`
          : 'Stock result retained as reference-only; not eligible hero',
      },
    );
  } catch (err) {
    return statusResult('pexels', 'TIMEOUT', String(err));
  }
}

/**
 * Resolve hero. Business-owned website og:image is tier 1 eligible.
 * Pexels ladder provides tier-4 representative stock when no owned media exists.
 */
export async function resolveHeroImage(params: {
  budget: EnrichmentBudget;
  websiteOgImage: string | null;
  websiteSourceUrl: string | null;
  category: string | null;
  businessType: string | null;
  businessName: string | null;
  suburb: string | null;
  placesTypes?: string[] | null;
  tags?: string[] | null;
  identityMatchedWebsite?: boolean;
}): Promise<{
  hero: HeroResolveResult | null;
  status: 'SUCCESS' | 'NO_ELIGIBLE_MEDIA' | 'NOT_CONFIGURED' | 'PARTIAL';
  adapterResults: SourceAdapterResult[];
}> {
  const adapterResults: SourceAdapterResult[] = [];

  if (params.websiteOgImage) {
    if (looksLikeLogoOrIcon(params.websiteOgImage)) {
      adapterResults.push(
        statusResult('business_website_og', 'PARTIAL', 'og:image looks like logo/icon', {
          sourceUrl: params.websiteSourceUrl,
        }),
      );
    } else if (params.identityMatchedWebsite === false) {
      adapterResults.push(
        statusResult('business_website_og', 'IDENTITY_MISMATCH', 'website identity not matched'),
      );
    } else {
      const hero: HeroResolveResult = {
        url: params.websiteOgImage,
        source: 'business_website',
        sourceUrl: params.websiteSourceUrl ?? params.websiteOgImage,
        rawExtract: params.websiteOgImage,
        eligible: true,
      };
      adapterResults.push(
        successResult('business_website_og', ['heroImageUrl'], hero, {
          sourceUrl: hero.sourceUrl,
        }),
      );
      return { hero, status: 'SUCCESS', adapterResults };
    }
  }

  const queries = buildHeroSearchQueries({
    businessName: params.businessName,
    suburb: params.suburb,
    category: params.category,
    businessType: params.businessType,
    placesTypes: params.placesTypes,
    tags: params.tags,
    metro: 'Melbourne',
  });

  for (const query of queries) {
    if (params.budget.websiteFetches >= params.budget.maxFetches) {
      adapterResults.push(statusResult('pexels', 'SKIPPED', 'fetch budget exhausted'));
      break;
    }
    const pexels = await searchPexels(params.budget, query, { eligibleOnHit: true });
    adapterResults.push(pexels);
    if (pexels.status === 'SUCCESS' && pexels.data?.url && pexels.data.eligible) {
      return { hero: pexels.data, status: 'SUCCESS', adapterResults };
    }
  }

  if (!process.env.PIXABAY_API_KEY?.trim()) {
    adapterResults.push(statusResult('pixabay', 'NOT_CONFIGURED', 'PIXABAY_API_KEY missing'));
  }

  adapterResults.push(
    statusResult(
      'unsplash_category_template',
      'UNSUPPORTED',
      'Category stock templates are Cardbey visual treatment, not business enrichment',
    ),
  );

  return { hero: null, status: 'NO_ELIGIBLE_MEDIA', adapterResults };
}

/** @internal test helper */
export const __test = { buildHeroSearchQueries, searchPexels };

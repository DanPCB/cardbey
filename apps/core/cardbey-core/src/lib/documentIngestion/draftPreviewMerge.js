/**
 * Merge document extraction into an existing store draft preview (enrich, don't duplicate).
 */

import { parseJsonBlob } from '../../services/publishedArtifactProjection/parseJsonBlob.js';

const SHOW_PLACEHOLDER_THUMB =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>',
  );

/**
 * @param {object} extractedData
 * @param {(string | null)[]} [thumbUrls]
 */
export function buildItemsFromExtraction(extractedData, thumbUrls = []) {
  const products = Array.isArray(extractedData?.products) ? extractedData.products : [];
  const stamp = Date.now();
  return products.map((p, index) => {
    const name = String(p?.name ?? 'Product').trim() || 'Product';
    const slugPart = name.slice(0, 8).replace(/\s+/g, '-').toLowerCase() || 'item';
    const thumbUrl = thumbUrls[index] || null;
    return {
      id: `doc-${stamp}-${index}-${slugPart}`,
      name,
      description: [...(Array.isArray(p?.highlights) ? p.highlights : []), ...(Array.isArray(p?.includes) ? p.includes : [])]
        .filter(Boolean)
        .join('. '),
      price: p?.pricing?.[0]?.price ?? p?.price ?? null,
      currency: p?.pricing?.[0]?.currency ?? 'AUD',
      tags: [...(Array.isArray(p?.venues) ? p.venues : []), p?.location].filter(Boolean),
      location: p?.location ?? null,
      dates: p?.dates ?? null,
      deadline: p?.deadline ?? null,
      source: 'document_ingestion',
      featuredInShow: true,
      isPublished: true,
      ...(thumbUrl ? { imageUrl: thumbUrl, thumbUrl } : {}),
    };
  });
}

/**
 * @param {object} extractedData
 * @param {(string | null)[]} [thumbUrls]
 */
export function buildShowWorksFromExtraction(extractedData, thumbUrls = []) {
  return buildItemsFromExtraction(extractedData, thumbUrls).map((item, index) => {
    const thumb = thumbUrls[index] || SHOW_PLACEHOLDER_THUMB;
    return {
      id: item.id,
      title: item.name,
      name: item.name,
      kind: 'product_highlight',
      type: 'product_highlight',
      thumbnailUrl: thumb,
      mediaUrl: thumb,
      ctaLabel: 'View',
      location: item.location,
      dates: item.dates,
      price: item.price,
      currency: item.currency,
      source: 'document_ingestion',
    };
  });
}

/**
 * @param {object} website
 * @param {object[]} showWorks
 */
function mergeShowSectionIntoWebsite(website, showWorks) {
  if (!website || typeof website !== 'object') {
    return { sections: [{ type: 'show', content: { heading: 'Show', items: showWorks } }] };
  }
  const site = JSON.parse(JSON.stringify(website));
  if (!Array.isArray(site.sections)) site.sections = [];

  let showSection = site.sections.find((s) => s?.type === 'show');
  if (!showSection) {
    showSection = { type: 'show', content: { heading: 'Show', items: [] } };
    const uspIdx = site.sections.findIndex((s) => s?.type === 'usp_bar');
    if (uspIdx >= 0) site.sections.splice(uspIdx + 1, 0, showSection);
    else {
      const heroIdx = site.sections.findIndex((s) => s?.type === 'hero');
      site.sections.splice(heroIdx >= 0 ? heroIdx + 1 : 0, 0, showSection);
    }
  }

  const content =
    showSection.content && typeof showSection.content === 'object' ? { ...showSection.content } : {};
  const existingItems = Array.isArray(content.items)
    ? content.items
    : Array.isArray(content.works)
      ? content.works
      : [];
  const existingIds = new Set(existingItems.map((w) => String(w?.id ?? w?.title ?? '')));
  const newWorks = showWorks.filter((w) => !existingIds.has(String(w.id)));

  showSection.content = {
    ...content,
    heading: content.heading || 'Show',
    items: [...existingItems, ...newWorks],
  };

  return site;
}

/**
 * @param {unknown} rawPreview
 * @param {object} extractedData
 * @param {{ thumbUrls?: (string | null)[] }} [options]
 */
export function mergeExtractionIntoDraftPreview(rawPreview, extractedData, options = {}) {
  const thumbUrls = Array.isArray(options.thumbUrls) ? options.thumbUrls : [];
  const existing = parseJsonBlob(rawPreview) ?? {};
  const newItems = buildItemsFromExtraction(extractedData, thumbUrls);
  const existingNames = new Set(
    (Array.isArray(existing.items) ? existing.items : [])
      .map((it) => String(it?.name ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const dedupedItems = newItems.filter((it) => !existingNames.has(String(it.name).trim().toLowerCase()));

  const campaign =
    extractedData?.campaign && typeof extractedData.campaign === 'object' ? extractedData.campaign : null;
  const campaignTagline =
    typeof extractedData?.campaign === 'string'
      ? extractedData.campaign
      : campaign?.name ?? null;

  const showWorks = buildShowWorksFromExtraction(extractedData, thumbUrls);
  const documentContext = {
    source: 'document_ingestion',
    extractedAt: new Date().toISOString(),
    business: extractedData?.business ?? { name: extractedData?.businessName ?? null },
    products: extractedData?.products ?? [],
    contacts: extractedData?.contacts ?? [],
    campaign: extractedData?.campaign ?? null,
  };

  const merged = {
    ...existing,
    items: [...(Array.isArray(existing.items) ? existing.items : []), ...dedupedItems],
    tagline: existing.tagline || campaignTagline || existing.slogan || null,
    hero: {
      ...(existing.hero && typeof existing.hero === 'object' && !Array.isArray(existing.hero) ? existing.hero : {}),
      subheadline:
        extractedData?.products?.[0]?.highlights?.[0] ?? existing.hero?.subheadline ?? null,
    },
    documentContext,
  };

  const stylePrefs =
    existing.stylePreferences && typeof existing.stylePreferences === 'object' ? { ...existing.stylePreferences } : {};
  const websiteBase =
    existing.website && typeof existing.website === 'object'
      ? existing.website
      : stylePrefs.miniWebsite && typeof stylePrefs.miniWebsite === 'object'
        ? stylePrefs.miniWebsite
        : { sections: [] };

  const mergedWebsite = mergeShowSectionIntoWebsite(websiteBase, showWorks);
  merged.website = mergedWebsite;
  if (stylePrefs.miniWebsite) {
    merged.stylePreferences = { ...stylePrefs, miniWebsite: mergedWebsite };
  } else if (Object.keys(stylePrefs).length) {
    merged.stylePreferences = { ...stylePrefs, miniWebsite: mergedWebsite };
  }

  return merged;
}

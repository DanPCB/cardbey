/**
 * Map document extraction → SmartDocument build input + video brief.
 */

/**
 * @param {object} extractedData
 */
export function mapExtractionToSmartDocumentInput(extractedData) {
  const data = extractedData && typeof extractedData === 'object' ? extractedData : {};
  const campaign =
    data.campaign && typeof data.campaign === 'object' ? data.campaign : null;
  const firstProduct = Array.isArray(data.products) ? data.products[0] : null;

  return {
    type: 'flyer',
    subtype: 'document_ingestion',
    title: String(data.business?.name ?? data.businessName ?? 'Document ingestion').slice(0, 120),
    businessName: String(data.business?.name ?? data.businessName ?? '').trim() || undefined,
    businessType: String(data.business?.type ?? 'Services').trim() || 'Services',
    offer: campaign?.copy ? String(campaign.copy).slice(0, 240) : null,
    artifactText: Array.isArray(data.products)
      ? data.products
          .map((p) => String(p?.name ?? '').trim())
          .filter(Boolean)
          .join(' · ')
      : null,
  };
}

/**
 * @param {object} extractedData
 * @param {string} storeId
 */
export function mapExtractionToPrebuiltProducts(extractedData, storeId) {
  const products = Array.isArray(extractedData?.products) ? extractedData.products : [];
  return products.map((p) => ({
    storeId,
    name: String(p?.name ?? '').trim() || 'Untitled product',
    description: [...(Array.isArray(p?.highlights) ? p.highlights : []), ...(Array.isArray(p?.includes) ? p.includes : [])]
      .filter(Boolean)
      .join('. ')
      .slice(0, 2000),
    price: p?.pricing?.[0]?.price ?? p?.price ?? null,
    currency: p?.pricing?.[0]?.currency ?? p?.currency ?? 'AUD',
    tags: [...(Array.isArray(p?.venues) ? p.venues : []), p?.location].filter(Boolean),
    availability: { startDate: p?.dates ?? null, deadline: p?.deadline ?? null },
  }));
}

/**
 * @param {object} extractedData
 */
export function buildVideoPromptFromExtraction(extractedData) {
  const data = extractedData && typeof extractedData === 'object' ? extractedData : {};
  const product = Array.isArray(data.products) ? data.products[0] : null;
  const locations = product?.venues?.join(', ') ?? product?.location ?? '';
  const campaign =
    (data.campaign && typeof data.campaign === 'object' ? data.campaign.name : null) ??
    product?.name ??
    data.business?.name ??
    '';
  const highlight = Array.isArray(product?.highlights) ? product.highlights[0] : '';
  return [campaign, locations, highlight].filter((part) => String(part ?? '').trim()).join('. ').trim();
}

/**
 * @param {object} extractedData
 */
export function buildMiScenesFromExtraction(extractedData) {
  const data = extractedData && typeof extractedData === 'object' ? extractedData : {};
  const firstProduct = Array.isArray(data.products) ? data.products[0] : null;
  return [
    {
      type: 'promotion',
      brandName: data.business?.name ?? data.businessName ?? null,
      headline: firstProduct?.name ?? null,
      subheadline: Array.isArray(firstProduct?.highlights) ? firstProduct.highlights[0] : null,
      background: null,
      cta: 'Book now',
    },
    {
      type: 'product',
      ...(firstProduct && typeof firstProduct === 'object' ? firstProduct : {}),
    },
    {
      type: 'call_to_action',
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
    },
  ];
}

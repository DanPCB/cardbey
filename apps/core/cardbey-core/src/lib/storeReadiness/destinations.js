/**
 * Business Studio deep-links with human labels + catalog filters (Phase 2).
 */

/**
 * @param {string} storeId
 * @param {string|null} [draftId]
 * @param {{ productId?: string|null, filter?: string|null }} [opts]
 */
export function storeReadinessDestinations(storeId, draftId = null, opts = {}) {
  const sid = encodeURIComponent(String(storeId || '').trim());
  const draftQ = draftId ? `draftId=${encodeURIComponent(String(draftId))}` : '';
  const reviewBase = draftId
    ? `/app/store/draft/review?${draftQ}`
    : `/app/store/${sid}/preview`;

  const productId = opts.productId ? String(opts.productId) : null;
  const filter = opts.filter || null;

  const catalogIncomplete = `${reviewBase}#catalog&filter=incomplete`;
  const catalogProduct = productId
    ? `${reviewBase}#catalog&productId=${encodeURIComponent(productId)}`
    : `${reviewBase}#catalog`;

  return {
    businessProfile: `${reviewBase}#business-profile`,
    branding: `${reviewBase}#branding`,
    heroImages: `${reviewBase}#branding&focus=hero`,
    catalog: `${reviewBase}#catalog`,
    catalogFilterIncomplete: catalogIncomplete,
    catalogProduct,
    storefront: `${reviewBase}#storefront`,
    ctaSettings: `${reviewBase}#storefront&focus=cta`,
    contact: `${reviewBase}#contact`,
    commerce: `${reviewBase}#commerce`,
    marketing: `${reviewBase}#marketing`,
    trust: `${reviewBase}#trust`,
    overview: `/business/overview?storeId=${sid}`,
    menuSection: `${reviewBase}#catalog&filter=${encodeURIComponent(filter || 'menu')}`,
  };
}

/** Stable labels for Open buttons */
export const DESTINATION_LABELS = {
  businessProfile: 'Open Business Profile',
  branding: 'Open Branding',
  heroImages: 'Open Hero Images',
  catalog: 'Open Menu Section',
  catalogFilterIncomplete: 'Open Incomplete Products',
  catalogProduct: 'Open Product',
  storefront: 'Open Storefront',
  ctaSettings: 'Open CTA Settings',
  contact: 'Open Contact & Location',
  commerce: 'Open Commerce',
  marketing: 'Open Marketing',
  trust: 'Open Trust & Compliance',
  overview: 'Open Business Overview',
  menuSection: 'Open Menu Section',
};

/**
 * Resolve label for a destination URL / key + affected object.
 * @param {object} input
 */
export function resolveDestinationLabel(input) {
  const key = input.destinationKey || null;
  if (key && DESTINATION_LABELS[key]) {
    if (key === 'catalogProduct' && input.affectedObject?.id) {
      const label = input.affectedObject.label || input.affectedObject.id;
      return `Open Product #${String(label).slice(0, 40)}`;
    }
    return DESTINATION_LABELS[key];
  }
  const dest = String(input.destination || '');
  if (dest.includes('focus=hero') || dest.includes('#branding')) return DESTINATION_LABELS.heroImages;
  if (dest.includes('focus=cta')) return DESTINATION_LABELS.ctaSettings;
  if (dest.includes('filter=incomplete')) return DESTINATION_LABELS.catalogFilterIncomplete;
  if (dest.includes('productId=')) {
    const id = input.affectedObject?.id || 'item';
    return `Open Product #${id}`;
  }
  if (dest.includes('#catalog')) return DESTINATION_LABELS.catalog;
  if (dest.includes('#business-profile')) return DESTINATION_LABELS.businessProfile;
  if (dest.includes('#storefront')) return DESTINATION_LABELS.storefront;
  if (dest.includes('#contact')) return DESTINATION_LABELS.contact;
  if (dest.includes('#commerce')) return DESTINATION_LABELS.commerce;
  if (dest.includes('#marketing')) return DESTINATION_LABELS.marketing;
  if (dest.includes('#trust')) return DESTINATION_LABELS.trust;
  return 'Open in Business Studio';
}

/**
 * @param {string} destinationKey
 * @param {ReturnType<typeof storeReadinessDestinations>} dest
 * @param {object} [affectedObject]
 */
export function buildActionDestination(destinationKey, dest, affectedObject = null) {
  let href = dest[destinationKey] || dest.overview;
  if (destinationKey === 'catalogProduct' && affectedObject?.id) {
    href = storeReadinessDestinations(
      // store id already encoded in dest.overview query; rebuild from overview
      decodeURIComponent(String(dest.overview).split('storeId=')[1] || ''),
      null,
      { productId: affectedObject.id },
    ).catalogProduct;
    // Prefer paths already on dest when draftId present — caller should pass product-aware dest
    if (dest.catalogProduct && dest.catalogProduct.includes('draftId=')) {
      const base = dest.catalog.split('#')[0];
      href = `${base}#catalog&productId=${encodeURIComponent(affectedObject.id)}`;
    }
  }
  return {
    destination: href,
    destinationKey,
    destinationLabel: resolveDestinationLabel({
      destinationKey,
      destination: href,
      affectedObject,
    }),
    destinationFilter:
      destinationKey === 'catalogFilterIncomplete'
        ? 'incomplete'
        : destinationKey === 'menuSection'
          ? 'menu'
          : null,
  };
}

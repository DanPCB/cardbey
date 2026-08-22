/**
 * Vertical / business-type specific deterministic rules (Phase 2).
 */

import { createFinding } from './findings.js';
import { storeReadinessDestinations } from './destinations.js';

/**
 * @param {string} typeOrCategory
 * @returns {'restaurant'|'retail'|'service'|'creator'|'general'}
 */
export function resolveBusinessVertical(typeOrCategory) {
  const raw = String(typeOrCategory || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'general';
  if (
    /restaurant|cafe|café|food|dining|bakery|bar|kitchen|pho|menu|takeaway|pizza/.test(raw)
  ) {
    return 'restaurant';
  }
  if (/retail|shop|store|boutique|fashion|goods|merchandise|ecommerce/.test(raw)) {
    return 'retail';
  }
  if (
    /creator|artist|influencer|portfolio|photographer|videographer|designer|maker/.test(raw)
  ) {
    return 'creator';
  }
  if (
    /service|consult|repair|tradie|handyman|salon|clinic|coach|agency|professional|booking/.test(
      raw,
    )
  ) {
    return 'service';
  }
  return 'general';
}

function hasText(v) {
  return v != null && String(v).trim() !== '';
}

/**
 * @param {object} store
 * @returns {import('./types.js').StoreReadinessFinding[]}
 */
export function runVerticalReadinessRules(store) {
  const storeId = String(store.id || store.storeId || '');
  const dest = storeReadinessDestinations(storeId, store.draftId || null);
  const generatedAt = store.generatedAt || new Date().toISOString();
  const vertical = resolveBusinessVertical(store.type || store.category || store.vertical);
  const products = (Array.isArray(store.products) ? store.products : []).filter((p) => !p.deletedAt);
  const active = products.filter((p) => p.isPublished !== false);
  /** @type {import('./types.js').StoreReadinessFinding[]} */
  const findings = [];

  const push = (partial) => {
    findings.push(createFinding({ ...partial, generatedAt }));
  };

  if (vertical === 'restaurant') {
    if (active.length > 0 && active.length < 3) {
      push({
        code: 'VERTICAL_RESTAURANT_MENU_COVERAGE',
        severity: 'improvement',
        category: 'catalog',
        title: 'Expand menu coverage',
        reason: 'Restaurant menus usually need several sellable dishes for a complete customer journey.',
        recommendation: 'Add more menu items so customers have clear choices.',
        evidence: {
          vertical: 'restaurant',
          activeItemCount: active.length,
          recommendedMinimum: 3,
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'navigate',
        destination: dest.catalog,
        destinationKey: 'menuSection',
        destinationLabel: 'Open Menu Section',
        pilCanAssist: true,
      });
    }
    const featured = active.filter((p) => p.isFeatured === true || p.featured === true);
    if (active.length >= 3 && featured.length === 0) {
      push({
        code: 'VERTICAL_RESTAURANT_FEATURED_DISHES',
        severity: 'optional',
        category: 'marketing',
        title: 'Feature signature dishes',
        reason: 'No featured dishes were marked for the restaurant.',
        recommendation: 'Mark 1–3 signature dishes as featured.',
        evidence: {
          vertical: 'restaurant',
          featuredCount: 0,
          activeItemCount: active.length,
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'suggest_edit',
        destination: dest.catalog,
        destinationKey: 'catalog',
        pilCanAssist: true,
      });
    }
  }

  if (vertical === 'retail') {
    const missingPrice = active.filter((p) => p.price == null || Number.isNaN(Number(p.price)));
    if (missingPrice.length > 0) {
      push({
        code: 'VERTICAL_RETAIL_PRICING',
        severity: 'important',
        category: 'catalog',
        title: 'Complete retail pricing',
        reason: 'Retail customers expect clear prices on visible products.',
        recommendation: 'Add prices to all retail products customers can browse.',
        evidence: {
          vertical: 'retail',
          missingPriceCount: missingPrice.length,
          sampleProductIds: missingPrice.slice(0, 5).map((p) => p.id),
        },
        affectedObject: {
          type: 'product',
          id: String(missingPrice[0].id),
          label: missingPrice[0].name,
        },
        recommendedActionType: 'suggest_edit',
        destination: dest.catalogFilterIncomplete,
        destinationKey: 'catalogFilterIncomplete',
        destinationFilter: 'incomplete',
        pilCanAssist: true,
      });
    }
    const stockVisible = active.some(
      (p) => p.stockStatus != null || p.inStock != null || p.inventoryVisible === true,
    );
    if (active.length > 0 && !stockVisible && store.stockVisibilityEnabled !== true) {
      push({
        code: 'VERTICAL_RETAIL_STOCK_VISIBILITY',
        severity: 'improvement',
        category: 'commerce',
        title: 'Show stock availability',
        reason: 'No stock visibility signal was found for retail products.',
        recommendation: 'Enable stock visibility or mark in-stock status on key items.',
        evidence: {
          vertical: 'retail',
          stockVisibilityEnabled: false,
          activeItemCount: active.length,
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'navigate',
        destination: dest.commerce,
        destinationKey: 'commerce',
        pilCanAssist: true,
      });
    }
  }

  if (vertical === 'service') {
    const thinDesc = active.filter((p) => !hasText(p.description) || String(p.description).length < 40);
    if (thinDesc.length > 0) {
      push({
        code: 'VERTICAL_SERVICE_DESCRIPTIONS',
        severity: 'important',
        category: 'catalog',
        title: 'Improve service descriptions',
        reason: 'Service offerings need clear descriptions so customers know what is included.',
        recommendation: 'Add richer descriptions to incomplete services.',
        evidence: {
          vertical: 'service',
          thinDescriptionCount: thinDesc.length,
          sampleProductIds: thinDesc.slice(0, 5).map((p) => p.id),
        },
        affectedObject: {
          type: 'product',
          id: String(thinDesc[0].id),
          label: thinDesc[0].name,
        },
        recommendedActionType: 'generate_content',
        destination: dest.catalogFilterIncomplete,
        destinationKey: 'catalogFilterIncomplete',
        pilCanAssist: true,
      });
    }
    const hasQuote =
      store.hasQuotePath === true || store.commercePaths?.quote === true || store.transactionMode === 'quote';
    const hasBooking =
      store.hasBookingPath === true ||
      store.commercePaths?.booking === true ||
      store.transactionMode === 'booking';
    if (!hasQuote && !hasBooking) {
      push({
        code: 'VERTICAL_SERVICE_QUOTE_PATH',
        severity: 'important',
        category: 'commerce',
        title: 'Enable quote or booking path',
        reason: 'Service businesses need a quote or booking path for customer conversion.',
        recommendation: 'Turn on quote requests or booking for your services.',
        evidence: {
          vertical: 'service',
          hasQuotePath: false,
          hasBookingPath: false,
          transactionMode: store.transactionMode || null,
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'navigate',
        destination: dest.commerce,
        destinationKey: 'commerce',
        pilCanAssist: true,
      });
    } else if (hasBooking === false && store.bookingReady !== true && hasQuote) {
      push({
        code: 'VERTICAL_SERVICE_BOOKING',
        severity: 'improvement',
        category: 'commerce',
        title: 'Improve booking readiness',
        reason: 'Quote path exists but booking readiness is not confirmed.',
        recommendation: 'Configure booking availability for bookable services.',
        evidence: {
          vertical: 'service',
          hasQuotePath: true,
          bookingReady: false,
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'navigate',
        destination: dest.commerce,
        destinationKey: 'commerce',
        pilCanAssist: true,
      });
    }
  }

  if (vertical === 'creator') {
    if (!hasText(store.description) || !hasText(store.tagline || store.slogan)) {
      push({
        code: 'VERTICAL_CREATOR_PUBLIC_PROFILE',
        severity: 'important',
        category: 'businessProfile',
        title: 'Complete public creator profile',
        reason: 'Creator storefronts need a public profile description and tagline.',
        recommendation: 'Add a short bio and tagline for your public profile.',
        evidence: {
          vertical: 'creator',
          hasDescription: hasText(store.description),
          hasTagline: hasText(store.tagline || store.slogan),
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'generate_content',
        destination: dest.businessProfile,
        destinationKey: 'businessProfile',
        pilCanAssist: true,
      });
    }
    if (active.length === 0) {
      push({
        code: 'VERTICAL_CREATOR_FEATURED_WORK',
        severity: 'important',
        category: 'catalog',
        title: 'Add featured work',
        reason: 'No published work items were found for this creator store.',
        recommendation: 'Publish at least one featured work sample.',
        evidence: {
          vertical: 'creator',
          featuredWorkCount: 0,
        },
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'navigate',
        destination: dest.catalog,
        destinationKey: 'catalog',
        pilCanAssist: true,
      });
    }
    if (!hasText(store.phone) && !hasText(store.email)) {
      push({
        code: 'VERTICAL_CREATOR_CONTACT',
        severity: 'important',
        category: 'contactAndLocation',
        title: 'Add a contact path',
        reason: 'Creators need a contact path for enquiries and bookings.',
        recommendation: 'Add an email or phone customers can use.',
        evidence: {
          vertical: 'creator',
          hasPhone: false,
          hasEmail: false,
        },
        affectedObject: { type: 'contact', id: storeId },
        recommendedActionType: 'navigate',
        destination: dest.contact,
        destinationKey: 'contact',
        pilCanAssist: true,
      });
    }
  }

  return findings;
}

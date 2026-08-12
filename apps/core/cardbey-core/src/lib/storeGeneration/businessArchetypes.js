/**
 * Behavioural / composition archetypes — NOT fixed visual templates.
 * Phase 1 contract (unwired).
 */

/**
 * @typedef {'FOOD_DINE_IN'|'FOOD_TAKEAWAY'|'CAFE'|'PROFESSIONAL_SERVICE'|'FINANCIAL_SERVICE'|'HOME_SERVICE'|'APPOINTMENT_SERVICE'|'RETAIL'|'ECOMMERCE'|'CREATOR'|'PORTFOLIO'|'B2B_SERVICE'|'HYBRID'|'UNKNOWN'} BusinessArchetype
 */

/**
 * @typedef {{
 *   archetype: BusinessArchetype,
 *   customerIntent: string[],
 *   primaryCTAs: string[],
 *   secondaryCTAs: string[],
 *   sectionPriority: string[],
 *   forbiddenPatterns: string[],
 *   transactionHint: 'ecommerce'|'order'|'booking'|'inquiry'|'hybrid'|'none',
 * }} ArchetypeCompositionDefaults
 */

/** @type {ReadonlyArray<BusinessArchetype>} */
export const BUSINESS_ARCHETYPES = Object.freeze([
  'FOOD_DINE_IN',
  'FOOD_TAKEAWAY',
  'CAFE',
  'PROFESSIONAL_SERVICE',
  'FINANCIAL_SERVICE',
  'HOME_SERVICE',
  'APPOINTMENT_SERVICE',
  'RETAIL',
  'ECOMMERCE',
  'CREATOR',
  'PORTFOLIO',
  'B2B_SERVICE',
  'HYBRID',
  'UNKNOWN',
]);

/** @type {Readonly<Record<BusinessArchetype, ArchetypeCompositionDefaults>>} */
export const ARCHETYPE_DEFAULTS = Object.freeze({
  FOOD_DINE_IN: {
    archetype: 'FOOD_DINE_IN',
    customerIntent: ['view_menu', 'order', 'visit', 'check_hours', 'call'],
    primaryCTAs: ['View Menu', 'Book a Table', 'Order Now'],
    secondaryCTAs: ['Call', 'Get Directions'],
    sectionPriority: ['hero', 'menu', 'featured_dishes', 'hours', 'location', 'gallery', 'about', 'contact'],
    forbiddenPatterns: ['add_to_cart_default', 'generic_service_packages', 'corporate_finance_imagery'],
    transactionHint: 'order',
  },
  FOOD_TAKEAWAY: {
    archetype: 'FOOD_TAKEAWAY',
    customerIntent: ['view_menu', 'order', 'check_hours', 'location', 'call'],
    primaryCTAs: ['Order Now', 'View Menu'],
    secondaryCTAs: ['Call', 'Get Directions'],
    sectionPriority: ['hero', 'menu', 'hours', 'location', 'order', 'about', 'contact'],
    forbiddenPatterns: ['add_to_cart_default', 'professional_services_structure'],
    transactionHint: 'order',
  },
  CAFE: {
    archetype: 'CAFE',
    customerIntent: ['view_menu', 'visit', 'check_hours', 'order', 'see_food'],
    primaryCTAs: ['View Menu', 'Order Now', 'Get Directions'],
    secondaryCTAs: ['Call'],
    sectionPriority: ['hero', 'menu', 'featured_dishes', 'hours', 'location', 'gallery', 'about'],
    forbiddenPatterns: ['generic_service_packages', 'corporate_office_imagery'],
    transactionHint: 'order',
  },
  PROFESSIONAL_SERVICE: {
    archetype: 'PROFESSIONAL_SERVICE',
    customerIntent: ['understand_services', 'establish_trust', 'enquire', 'book', 'call'],
    primaryCTAs: ['Make an Enquiry', 'Book a Consultation', 'Call'],
    secondaryCTAs: ['View Services'],
    sectionPriority: ['hero', 'value_proposition', 'services', 'why_us', 'process', 'trust', 'contact'],
    forbiddenPatterns: ['add_to_cart_default', 'product_grid_default', 'fabricated_packages'],
    transactionHint: 'inquiry',
  },
  FINANCIAL_SERVICE: {
    archetype: 'FINANCIAL_SERVICE',
    customerIntent: ['understand_services', 'establish_trust', 'enquire', 'book_consultation', 'call_adviser'],
    primaryCTAs: ['Discuss Your Options', 'Book a Consultation', 'Make an Enquiry'],
    secondaryCTAs: ['Call Adviser'],
    sectionPriority: [
      'hero',
      'value_proposition',
      'adviser',
      'services',
      'why_us',
      'trust',
      'process',
      'consultation_cta',
      'contact',
    ],
    forbiddenPatterns: ['add_to_cart_default', 'fabricated_packages', 'pets_food_beauty_imagery'],
    transactionHint: 'inquiry',
  },
  HOME_SERVICE: {
    archetype: 'HOME_SERVICE',
    customerIntent: ['understand_capability', 'see_work', 'request_quote', 'call'],
    primaryCTAs: ['Request a Quote', 'Call Now'],
    secondaryCTAs: ['View Services'],
    sectionPriority: ['hero', 'services', 'service_areas', 'past_work', 'trust', 'quote_cta', 'contact'],
    forbiddenPatterns: ['add_to_cart_default', 'beauty_imagery'],
    transactionHint: 'inquiry',
  },
  APPOINTMENT_SERVICE: {
    archetype: 'APPOINTMENT_SERVICE',
    customerIntent: ['view_services', 'book', 'check_hours', 'call'],
    primaryCTAs: ['Book Now', 'View Services'],
    secondaryCTAs: ['Call'],
    sectionPriority: ['hero', 'services', 'pricing', 'gallery', 'hours', 'booking_cta', 'about', 'contact'],
    forbiddenPatterns: ['add_to_cart_default'],
    transactionHint: 'booking',
  },
  RETAIL: {
    archetype: 'RETAIL',
    customerIntent: ['browse_products', 'inspect_product', 'purchase', 'visit'],
    primaryCTAs: ['Shop', 'View Products'],
    secondaryCTAs: ['Get Directions', 'Call'],
    sectionPriority: ['hero', 'featured_products', 'categories', 'about', 'location', 'contact'],
    forbiddenPatterns: ['professional_consultation_only'],
    transactionHint: 'hybrid',
  },
  ECOMMERCE: {
    archetype: 'ECOMMERCE',
    customerIntent: ['browse_products', 'inspect_product', 'purchase'],
    primaryCTAs: ['Shop', 'Add to Cart', 'Buy'],
    secondaryCTAs: ['View Products'],
    sectionPriority: ['hero', 'featured_products', 'categories', 'usp', 'about', 'contact'],
    forbiddenPatterns: [],
    transactionHint: 'ecommerce',
  },
  CREATOR: {
    archetype: 'CREATOR',
    customerIntent: ['see_work', 'follow', 'book', 'buy'],
    primaryCTAs: ['View Work', 'Book', 'Follow'],
    secondaryCTAs: ['Contact'],
    sectionPriority: ['hero', 'portfolio', 'about', 'offers', 'contact'],
    forbiddenPatterns: ['generic_retail_packages'],
    transactionHint: 'hybrid',
  },
  PORTFOLIO: {
    archetype: 'PORTFOLIO',
    customerIntent: ['see_work', 'enquire', 'book'],
    primaryCTAs: ['View Work', 'Enquire'],
    secondaryCTAs: ['Contact'],
    sectionPriority: ['hero', 'portfolio', 'about', 'process', 'contact'],
    forbiddenPatterns: ['add_to_cart_default', 'product_grid_default'],
    transactionHint: 'inquiry',
  },
  B2B_SERVICE: {
    archetype: 'B2B_SERVICE',
    customerIntent: ['understand_capability', 'establish_trust', 'enquire'],
    primaryCTAs: ['Contact Sales', 'Request a Demo', 'Make an Enquiry'],
    secondaryCTAs: ['View Services'],
    sectionPriority: ['hero', 'value_proposition', 'services', 'case_studies', 'trust', 'contact'],
    forbiddenPatterns: ['add_to_cart_default', 'consumer_lifestyle_imagery'],
    transactionHint: 'inquiry',
  },
  HYBRID: {
    archetype: 'HYBRID',
    customerIntent: ['browse', 'enquire', 'purchase', 'book'],
    primaryCTAs: ['Explore', 'Contact'],
    secondaryCTAs: ['Shop', 'Book'],
    sectionPriority: ['hero', 'offerings', 'about', 'trust', 'contact'],
    forbiddenPatterns: [],
    transactionHint: 'hybrid',
  },
  UNKNOWN: {
    archetype: 'UNKNOWN',
    customerIntent: ['learn_more', 'contact'],
    primaryCTAs: ['Learn More', 'Contact'],
    secondaryCTAs: [],
    sectionPriority: ['hero', 'about', 'offerings', 'contact'],
    forbiddenPatterns: ['fabricated_packages', 'unsupported_claims'],
    transactionHint: 'none',
  },
});

/**
 * Lightweight heuristic from category / name signals (not a full classifier).
 * @param {{ category?: string|null, businessName?: string|null, businessType?: string|null }} input
 * @returns {BusinessArchetype}
 */
export function inferArchetypeFromHints(input = {}) {
  const corpus = `${input.category || ''} ${input.businessName || ''} ${input.businessType || ''}`.toLowerCase();
  if (/\b(mortgage|broker|finance|financial|loan|adviser|advisor|insurance)\b/.test(corpus)) {
    return 'FINANCIAL_SERVICE';
  }
  if (/\b(lawyer|legal|accountant|consult|agency|coach)\b/.test(corpus)) {
    return 'PROFESSIONAL_SERVICE';
  }
  if (/\b(plumb\w*|electr\w*|handyman|builder|renovat\w*|cleaning|garden\w*|trade|trades?)\b/.test(corpus)) {
    return 'HOME_SERVICE';
  }
  if (/\b(salon|beauty|hair|barber|spa|nail|dental|clinic)\b/.test(corpus)) {
    return 'APPOINTMENT_SERVICE';
  }
  if (/\b(cafe|café|coffee|breakfast|brunch)\b/.test(corpus)) return 'CAFE';
  if (/\b(noodle|takeaway|take-away|pizza|burger|kebab)\b/.test(corpus)) return 'FOOD_TAKEAWAY';
  if (/\b(restaurant|dining|bistro|eatery|food)\b/.test(corpus)) return 'FOOD_DINE_IN';
  if (/\b(ecommerce|online\s*shop|shopify)\b/.test(corpus)) return 'ECOMMERCE';
  if (/\b(fashion|retail|boutique|store|shop)\b/.test(corpus)) return 'RETAIL';
  if (/\b(artist|creator|photographer|portfolio)\b/.test(corpus)) return 'PORTFOLIO';
  if (/\b(b2b|saas|enterprise)\b/.test(corpus)) return 'B2B_SERVICE';
  return 'UNKNOWN';
}

/**
 * @param {BusinessArchetype} archetype
 * @returns {ArchetypeCompositionDefaults}
 */
export function getArchetypeDefaults(archetype) {
  return ARCHETYPE_DEFAULTS[archetype] || ARCHETYPE_DEFAULTS.UNKNOWN;
}

export default {
  BUSINESS_ARCHETYPES,
  ARCHETYPE_DEFAULTS,
  inferArchetypeFromHints,
  getArchetypeDefaults,
};

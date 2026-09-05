/**
 * Deterministic classification rules (Phase 2).
 * Order is enforced by businessContentClassifier.js — not AI first.
 */

import { makeClassification } from './classificationResult.js';
import { evidenceText } from './classificationEvidence.js';

/** @typedef {import('./classificationEvidence.js').ClassificationInput} ClassificationInput */
/** @typedef {import('./classificationResult.js').BusinessContentClassification} BusinessContentClassification */

const POLICY_PHRASES = [
  'terms and conditions',
  'terms & conditions',
  'terms of service',
  'terms of use',
  'privacy policy',
  'privacy',
  'refund policy',
  'return policy',
  'returns policy',
  'return & guarantee',
  'return and guarantee',
  'payment policy',
  'customer policy',
  'shipping policy',
  'delivery policy',
  'warranty policy',
  'guarantee policy',
];

const CAREER_PHRASES = [
  'careers',
  'career',
  'jobs',
  'employment',
  'vacancies',
  'join our team',
  'work with us',
  'we are hiring',
];

const TESTIMONIAL_PHRASES = [
  'testimonials',
  'testimonial',
  'customer reviews',
  'success stories',
  'customer stories',
  'what clients say',
  'what our clients say',
];

const TRUST_PHRASES = [
  'why choose us',
  'our difference',
  'our promise',
  'certifications',
  'accreditations',
  'awards',
  'quality commitment',
];

const NAV_EXACT = new Set([
  'home',
  'search',
  'cart',
  'account',
  'login',
  'register',
  'sign in',
  'sign up',
  'sitemap',
  'menu',
]);

const SERVICE_ACTION_RE =
  /\b(convert|repair|repairs|replace|replacement|install|installation|remove|removal|upgrade|service|servicing|consultation|consult|design|colour|color|motor|emergency|fix|clean|cleaning|maintain|maintenance)\b/i;

const CATEGORY_LOCATION_SUFFIX_RE =
  /\b(melbourne|sydney|brisbane|perth|adelaide|canberra|hobart|geelong|australia|vic|nsw|qld|wa|sa)\b/i;

/**
 * @param {ClassificationInput} input
 * @param {RegExp|string} pattern
 * @param {string} type
 */
function ev(input, pattern, type) {
  const text = evidenceText(input);
  const matched =
    typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text) || pattern.test(input.labelLower);
  return matched
    ? [{ type, value: input.label || input.urlPath, weight: 1 }]
    : [{ type, value: input.label || input.urlPath, weight: 0.5 }];
}

/**
 * 1–2. Explicit / schema types
 * @param {ClassificationInput} input
 * @returns {BusinessContentClassification | null}
 */
export function matchExplicitOrSchema(input) {
  const explicitRoleMap = {
    service_category: 'service_category',
    product_category: 'product_category',
    menu_item: 'menu_item',
    menu_category: 'menu_category',
    testimonial: 'testimonial',
    testimonials: 'testimonial',
    policy: 'policy',
    career: 'career',
    navigation: 'navigation',
    trust_content: 'trust_content',
    about: 'about',
    contact: 'contact',
    location: 'location',
    project: 'project',
    gallery: 'gallery',
  };

  for (const key of [input.itemType, input.sourceType, input.schemaType]) {
    if (explicitRoleMap[key]) {
      return makeClassification(explicitRoleMap[key], 0.95, 'explicit_source_type', [
        { type: 'explicit_type', value: key, weight: 1 },
      ]);
    }
  }

  if (input.schemaType === 'product' || input.schemaType === 'http://schema.org/product') {
    return makeClassification('product', 0.92, 'schema_type', [
      { type: 'schema_type', value: input.schemaType, weight: 1 },
    ]);
  }
  if (input.schemaType === 'service' || input.schemaType === 'http://schema.org/service') {
    return makeClassification('service', 0.9, 'schema_type', [
      { type: 'schema_type', value: input.schemaType, weight: 1 },
    ]);
  }
  if (input.schemaType === 'menuitem' || input.schemaType === 'http://schema.org/menuitem') {
    return makeClassification('menu_item', 0.92, 'schema_type', [
      { type: 'schema_type', value: input.schemaType, weight: 1 },
    ]);
  }

  return null;
}

/**
 * 3. Strong deterministic exclusions (policy / career / nav / trust / testimonial)
 * @param {ClassificationInput} input
 * @returns {BusinessContentClassification | null}
 */
export function matchStrongExclusions(input) {
  const text = evidenceText(input);
  const label = input.labelLower;

  // Policy — phrase-first; avoid "warranty repairs" as policy
  const warrantyService =
    /\bwarranty\b/.test(label) && /\b(repair|repairs|service|servicing|fix)\b/.test(label);
  if (!warrantyService) {
    for (const phrase of POLICY_PHRASES) {
      if (text.includes(phrase) || label === phrase || label.includes(phrase)) {
        // Lone "privacy" / "returns" on short labels
        if (phrase === 'privacy' && label.length > 40 && !/privacy/.test(label)) continue;
        return makeClassification('policy', 0.93, 'deterministic_label', ev(input, phrase, 'policy_phrase'));
      }
    }
    // Path-based policy
    if (/\/(terms|privacy|refund|returns?|policies?)(\/|$)/i.test(input.urlPath)) {
      return makeClassification('policy', 0.9, 'url_pattern', [
        { type: 'url_path', value: input.urlPath, weight: 1 },
      ]);
    }
  }

  for (const phrase of CAREER_PHRASES) {
    if (label === phrase || label.includes(phrase) || text.includes(phrase)) {
      return makeClassification('career', 0.93, 'deterministic_label', ev(input, phrase, 'career_phrase'));
    }
  }
  if (/\/(careers?|jobs|employment)(\/|$)/i.test(input.urlPath)) {
    return makeClassification('career', 0.9, 'url_pattern', [
      { type: 'url_path', value: input.urlPath, weight: 1 },
    ]);
  }

  // Testimonials — exact/strong labels; "reviews" alone only if not product listing context
  for (const phrase of TESTIMONIAL_PHRASES) {
    if (label === phrase || label.includes(phrase)) {
      return makeClassification('testimonial', 0.92, 'deterministic_label', ev(input, phrase, 'testimonial_phrase'));
    }
  }
  if (label === 'reviews' || label === 'customer reviews') {
    const productListing =
      input.hasPurchaseAction ||
      input.navigationParent.includes('product') ||
      /\b(sku|collection|shop)\b/.test(text);
    if (!productListing) {
      return makeClassification('testimonial', 0.85, 'deterministic_label', [
        { type: 'label', value: label, weight: 0.9 },
      ]);
    }
  }

  for (const phrase of TRUST_PHRASES) {
    if (label === phrase || label.includes(phrase) || text.includes(phrase)) {
      return makeClassification('trust_content', 0.92, 'deterministic_label', ev(input, phrase, 'trust_phrase'));
    }
  }

  if (NAV_EXACT.has(label) || label === 'home page') {
    return makeClassification('navigation', 0.95, 'deterministic_label', [
      { type: 'label', value: label, weight: 1 },
    ]);
  }

  // Inventory chrome — never an offering
  if (/\b((in|out\s*of)\s*stock)\b|\(\s*\d+\s*products?\s*\)/i.test(input.label)) {
    return makeClassification('inventory_metadata', 0.97, 'deterministic_label', [
      { type: 'label', value: input.label, weight: 1 },
    ]);
  }

  // Florist / gift occasion taxonomy — category filters, not products
  if (
    /^(birthday|sympathy|love\s*&?\s*romance|love\s*romance|anniversary|get\s*well|new\s*baby|mother'?s?\s*day|father'?s?\s*day|valentine'?s?(?:\s*day)?|christmas|wedding|funeral|congratulations|thank\s*you|just\s*because)$/i.test(
      input.label,
    )
  ) {
    return makeClassification('product_category', 0.94, 'deterministic_label', [
      { type: 'occasion_category', value: input.label, weight: 1 },
    ]);
  }

  if (/^(about|about us)$/i.test(input.label) || /\/about(-us)?(\/|$)/i.test(input.urlPath)) {
    return makeClassification('about', 0.9, 'deterministic_label', [
      { type: 'label', value: input.label, weight: 1 },
    ]);
  }
  if (/^(contact|contact us)$/i.test(input.label) || /\/contact(-us)?(\/|$)/i.test(input.urlPath)) {
    return makeClassification('contact', 0.9, 'deterministic_label', [
      { type: 'label', value: input.label, weight: 1 },
    ]);
  }
  if (
    /^(location|find us|our location|service area)$/i.test(input.label) ||
    /\/(location|find-us|service-area)(\/|$)/i.test(input.urlPath)
  ) {
    return makeClassification('location', 0.88, 'deterministic_label', [
      { type: 'label', value: input.label, weight: 1 },
    ]);
  }

  if (/\b(blog|news|articles)\b/i.test(label) || /\/(blog|news|articles)(\/|$)/i.test(input.urlPath)) {
    return makeClassification('blog', 0.88, 'url_pattern', [
      { type: 'label_or_path', value: input.label || input.urlPath, weight: 1 },
    ]);
  }
  if (/\b(faq|help|support|resources)\b/i.test(label) || /\/(faq|help|support)(\/|$)/i.test(input.urlPath)) {
    return makeClassification('support', 0.88, 'url_pattern', [
      { type: 'label_or_path', value: input.label || input.urlPath, weight: 1 },
    ]);
  }

  return null;
}

/**
 * 5. Commerce / booking evidence
 * @param {ClassificationInput} input
 * @returns {BusinessContentClassification | null}
 */
export function matchCommerceEvidence(input) {
  if (input.hasPurchaseAction && (input.hasPrice || input.raw.sku || input.raw.SKU)) {
    return makeClassification('product', 0.9, 'price_and_purchase_evidence', [
      { type: 'purchase_action', value: 'true', weight: 1 },
      { type: 'price_or_sku', value: String(input.raw.sku ?? input.raw.price ?? ''), weight: 0.8 },
    ]);
  }
  if (input.hasBookingEvidence && !input.hasPurchaseAction) {
    // Booking evidence alone on a named offer → service (not category)
    if (input.label && SERVICE_ACTION_RE.test(input.label)) {
      return makeClassification('service', 0.82, 'booking_evidence', [
        { type: 'booking', value: 'true', weight: 1 },
      ]);
    }
  }
  return null;
}

/**
 * Restaurant menu signals
 * @param {ClassificationInput} input
 * @param {Record<string, unknown>} [context]
 * @returns {BusinessContentClassification | null}
 */
export function matchMenuRoles(input, context = {}) {
  const vertical = String(context.businessType ?? context.vertical ?? '').toLowerCase();
  const foodContext =
    /food|restaurant|cafe|menu/.test(vertical) ||
    input.navigationParent.includes('menu') ||
    /\/menu(\/|$)/i.test(input.urlPath);

  if (!foodContext) return null;

  if (input.itemType === 'menu_category' || /menu[_-]?category/.test(input.sourceType)) {
    return makeClassification('menu_category', 0.9, 'explicit_source_type', [
      { type: 'menu_context', value: input.label, weight: 1 },
    ]);
  }
  if (input.hasPrice && foodContext && input.label) {
    return makeClassification('menu_item', 0.86, 'price_and_purchase_evidence', [
      { type: 'menu_item_price', value: input.label, weight: 0.9 },
    ]);
  }
  if (foodContext && /^(starters|mains|desserts|drinks|sides|specials)$/i.test(input.label)) {
    return makeClassification('menu_category', 0.84, 'deterministic_label', [
      { type: 'menu_section', value: input.label, weight: 0.9 },
    ]);
  }
  return null;
}

/**
 * 6. Offering distinction: service vs service_category / product vs product_category
 * @param {ClassificationInput} input
 * @param {Record<string, unknown>} [context]
 * @returns {BusinessContentClassification | null}
 */
export function matchOfferingRoles(input, context = {}) {
  const menuHit = matchMenuRoles(input, context);
  if (menuHit) return menuHit;

  const label = input.label;
  if (!label) return null;

  // Product collection / category hierarchy
  if (
    input.navigationParent.includes('collection') ||
    /\/collections?\//i.test(input.urlPath) ||
    (context.hasPurchasableChildren === true && !SERVICE_ACTION_RE.test(label))
  ) {
    return makeClassification('product_category', 0.8, 'navigation_hierarchy', [
      { type: 'collection', value: label, weight: 0.9 },
    ]);
  }

  // Specific service activities
  if (SERVICE_ACTION_RE.test(label)) {
    return makeClassification('service', 0.88, 'deterministic_label', [
      { type: 'service_action_verb', value: label, weight: 1 },
    ]);
  }

  // Broad offering families — need category signal (type, nav, location suffix, or multi-word trade label)
  const wordCount = label.split(/\s+/).filter(Boolean).length;
  const hasCategorySignal =
    CATEGORY_LOCATION_SUFFIX_RE.test(label) ||
    input.navigationDepth === 1 ||
    /product|service|dropdown|categor/i.test(input.navigationParent) ||
    input.sourceType === 'service_category' ||
    input.itemType === 'service_category' ||
    (wordCount >= 2 && label.length >= 8);

  const looksLikeCategory =
    !input.hasPrice &&
    !input.hasPurchaseAction &&
    !SERVICE_ACTION_RE.test(label) &&
    label.length >= 3 &&
    label.length <= 72 &&
    /^[\w][\w &/'+.-]*$/i.test(label) &&
    hasCategorySignal;

  if (looksLikeCategory) {
    return makeClassification('service_category', 0.84, 'navigation_hierarchy', [
      { type: 'category_shape', value: label, weight: 0.85 },
    ]);
  }

  // Priced SKU-like product without purchase flag still needs more than price alone —
  // require sku OR product path
  if (input.hasPrice && (input.raw.sku || /\/products?\//i.test(input.urlPath))) {
    return makeClassification('product', 0.82, 'price_and_purchase_evidence', [
      { type: 'priced_product_page', value: label, weight: 0.85 },
    ]);
  }

  return null;
}

/**
 * Research provider type hints (e.g. extracted as service_category)
 * @param {ClassificationInput} input
 * @returns {BusinessContentClassification | null}
 */
export function matchResearchProviderType(input) {
  const t = String(input.raw.type ?? input.itemType ?? '').toLowerCase();
  if (t === 'service_category') {
    return makeClassification('service_category', 0.94, 'research_provider_type', [
      { type: 'research_type', value: t, weight: 1 },
    ]);
  }
  return null;
}

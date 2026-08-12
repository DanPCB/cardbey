/**
 * Phase 2 — Evidence → BusinessUnderstanding → BrandStyle → StoreCompositionPlan
 * for the canonical generateDraft path (flag-gated by caller).
 */

import { storeField } from './fieldStatus.js';
import {
  createEmptyEvidenceBundle,
  addExtractedFact,
  addVisualSignal,
} from './evidenceBundle.js';
import {
  createEmptyBusinessUnderstanding,
  toDisplayReadyCopy,
} from './businessUnderstanding.js';
import { createEmptyBrandStyleProfile } from './brandStyleProfile.js';
import {
  inferArchetypeFromHints,
  getArchetypeDefaults,
} from './businessArchetypes.js';
import {
  buildStoreCompositionPlan,
  evaluateCompositionGenericness,
} from './storeCompositionPlan.js';

const MAX_GATE_RETRIES = 2;

const GENERIC_OFFERING_RE =
  /^(basic|premium|essential|core|express|standard|starter|business)\s+(package|service)|custom quote|featured item|popular choice|special deal$/i;

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asStringList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (typeof x === 'string') return x.trim();
        if (x && typeof x === 'object') {
          return String(x.name ?? x.title ?? x.label ?? '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\n|;|\|/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 120);
  }
  return [];
}

/**
 * Extract menu/service-like lines from OCR / prompt text.
 * @param {string} text
 * @returns {string[]}
 */
export function extractOfferingLinesFromText(text) {
  const t = String(text || '');
  if (!t.trim()) return [];
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (/^(tel|phone|email|www\.|http|open|hours|address|mon|tue|wed|thu|fri|sat|sun)\b/i.test(line)) {
      continue;
    }
    // "Item .... $12" or "Item - 12.00"
    const m = line.match(/^(.{2,80}?)(?:\s{2,}|\s[-–—]\s|\s\$|\s\d+\.\d{2}\s*$)/);
    const candidate = (m ? m[1] : line).replace(/\s+/g, ' ').trim();
    if (candidate.length < 2 || candidate.length > 80) continue;
    if (GENERIC_OFFERING_RE.test(candidate)) continue;
    if (/^[A-Z\s]{3,}$/.test(candidate) && candidate.split(/\s+/).length <= 2 && !/\$|\d/.test(line)) {
      // Likely a section header (MENU, SERVICES) — skip short all-caps
      if (candidate.length <= 18) continue;
    }
    out.push(candidate);
    if (out.length >= 24) break;
  }
  return [...new Set(out)];
}

/**
 * @param {Record<string, any>} input
 */
export function collectEvidenceOfferings(input = {}) {
  const fromArrays = [
    ...asStringList(input.detectedServices),
    ...asStringList(input.detectedProducts),
    ...asStringList(input.menuItems),
    ...asStringList(input.services),
    ...asStringList(input.products),
    ...asStringList(input.seedItems),
    ...asStringList(input.offerings),
    ...asStringList(input.items),
  ];
  const fromText = [
    ...extractOfferingLinesFromText(input.ocrRawText),
    ...extractOfferingLinesFromText(input.documentText),
  ];
  // Prompt-led: only take lines that look like offering lists, not whole paragraphs
  const prompt = String(input.prompt || input.businessDescription || '').trim();
  if (prompt && /\n/.test(prompt)) {
    fromText.push(...extractOfferingLinesFromText(prompt));
  }

  const seen = new Set();
  const offerings = [];
  for (const name of [...fromArrays, ...fromText]) {
    const key = name.toLowerCase();
    if (seen.has(key) || GENERIC_OFFERING_RE.test(name)) continue;
    seen.add(key);
    offerings.push(name);
  }
  return offerings;
}

/**
 * Category/default palette when no visual evidence (still archetype-aware, not purple-default).
 * @param {string} archetype
 */
function categoryPalette(archetype) {
  switch (archetype) {
    case 'FINANCIAL_SERVICE':
    case 'PROFESSIONAL_SERVICE':
    case 'B2B_SERVICE':
      return {
        primaryColors: ['#0B1F3A', '#1B4F8A'],
        secondaryColors: ['#FFFFFF', '#E8EEF5'],
        neutrals: ['#F7F9FC', '#334155'],
        tone: 'professional',
        graphicLanguage: 'structured',
        formality: /** @type {const} */ ('formal'),
        imageryDirection: 'trust-led',
        negativeResourceCharacteristics: ['pets', 'food', 'beauty', 'nightlife'],
      };
    case 'CAFE':
      return {
        primaryColors: ['#5C4033', '#F5F0E6'],
        secondaryColors: ['#FFFFFF', '#C4A484'],
        neutrals: ['#FAF7F2', '#3F2A1D'],
        tone: 'warm',
        graphicLanguage: 'rustic',
        formality: /** @type {const} */ ('casual'),
        imageryDirection: 'food-led',
        negativeResourceCharacteristics: ['corporate office', 'finance', 'beauty salon'],
      };
    case 'FOOD_TAKEAWAY':
    case 'FOOD_DINE_IN':
      return {
        primaryColors: ['#E85D04', '#111111'],
        secondaryColors: ['#FFFFFF', '#FFBA08'],
        neutrals: ['#F8F8F8', '#1A1A1A'],
        tone: 'bold',
        graphicLanguage: 'simple',
        formality: /** @type {const} */ ('casual'),
        imageryDirection: 'food-led',
        negativeResourceCharacteristics: ['corporate finance', 'beauty', 'pets'],
      };
    case 'HOME_SERVICE':
      return {
        primaryColors: ['#1F2937', '#F59E0B'],
        secondaryColors: ['#FFFFFF', '#E5E7EB'],
        neutrals: ['#F3F4F6', '#111827'],
        tone: 'practical',
        graphicLanguage: 'utilitarian',
        formality: /** @type {const} */ ('balanced'),
        imageryDirection: 'work-in-progress',
        negativeResourceCharacteristics: ['beauty', 'fine dining', 'fashion runway'],
      };
    case 'APPOINTMENT_SERVICE':
      return {
        primaryColors: ['#831843', '#FDF2F8'],
        secondaryColors: ['#FFFFFF', '#F9A8D4'],
        neutrals: ['#FFF7FB', '#4A044E'],
        tone: 'polished',
        graphicLanguage: 'soft',
        formality: /** @type {const} */ ('balanced'),
        imageryDirection: 'lifestyle-beauty',
        negativeResourceCharacteristics: ['construction', 'finance', 'fast food'],
      };
    case 'RETAIL':
    case 'ECOMMERCE':
      return {
        primaryColors: ['#111827', '#F8FAFC'],
        secondaryColors: ['#FFFFFF', '#94A3B8'],
        neutrals: ['#F1F5F9', '#0F172A'],
        tone: 'editorial',
        graphicLanguage: 'clean',
        formality: /** @type {const} */ ('balanced'),
        imageryDirection: 'product-led',
        negativeResourceCharacteristics: [],
      };
    default:
      return {
        primaryColors: [],
        secondaryColors: [],
        neutrals: [],
        tone: null,
        graphicLanguage: null,
        formality: null,
        imageryDirection: null,
        negativeResourceCharacteristics: [],
      };
  }
}

/**
 * @param {Record<string, any>} input
 * @param {string} archetype
 */
function buildBrandFromInput(input, archetype) {
  const defaults = categoryPalette(archetype);
  const colors = [];
  const pushColor = (c) => {
    const s = String(c || '').trim();
    if (s && /^#?[0-9a-fA-F]{3,8}$/.test(s.replace(/^#/, '#'))) {
      colors.push(s.startsWith('#') ? s : `#${s}`);
    }
  };
  const bc = input.brandColors || input.brandKit || input.stylePreferences || {};
  pushColor(bc.primary || bc.primaryColor || input.primaryColor);
  pushColor(bc.secondary || bc.secondaryColor || input.secondaryColor);
  pushColor(bc.accent || input.accentColor);
  if (Array.isArray(bc.palette)) bc.palette.forEach(pushColor);

  const hasVisual = colors.length > 0 || Boolean(input.logoUrl || input.logo || input.photoDataUrl);
  const primaryColors = colors.length ? colors.slice(0, 2) : defaults.primaryColors;
  const secondaryColors = colors.length > 2 ? colors.slice(2) : defaults.secondaryColors;

  return createEmptyBrandStyleProfile({
    sourceConfidence: hasVisual ? 0.8 : primaryColors.length ? 0.55 : 0.2,
    primaryColors,
    secondaryColors,
    neutrals: defaults.neutrals,
    typographyDirection:
      archetype === 'FINANCIAL_SERVICE' || archetype === 'PROFESSIONAL_SERVICE'
        ? 'clean sans, structured'
        : archetype === 'CAFE'
          ? 'warm readable'
          : null,
    imageryDirection: defaults.imageryDirection,
    graphicLanguage: defaults.graphicLanguage,
    layoutCharacter: defaults.graphicLanguage,
    density: archetype.startsWith('FOOD') || archetype === 'CAFE' ? 'medium' : 'medium',
    tone: defaults.tone,
    formality: defaults.formality,
    trustLevel:
      archetype === 'FINANCIAL_SERVICE' || archetype === 'PROFESSIONAL_SERVICE' ? 'high' : 'medium',
    energy: archetype === 'FOOD_TAKEAWAY' ? 'bold' : 'balanced',
    CTACharacter: getArchetypeDefaults(archetype).primaryCTAs[0] || null,
    preferredResourceCharacteristics: [defaults.imageryDirection, defaults.tone].filter(Boolean),
    negativeResourceCharacteristics: defaults.negativeResourceCharacteristics,
    evidenceRefs: hasVisual ? ['visual_or_brand_colors'] : [],
  });
}

/**
 * Map composition sections to preview website section types.
 * @param {string[]} sectionPriority
 */
export function mapSectionsToWebsiteTypes(sectionPriority) {
  const mapped = [];
  const seen = new Set();
  const push = (type) => {
    if (seen.has(type)) return;
    seen.add(type);
    mapped.push(type);
  };
  push('hero');
  for (const s of sectionPriority || []) {
    if (s === 'hero') continue;
    if (['menu', 'featured_dishes', 'featured_products', 'collections', 'products', 'services', 'offerings', 'popular_dishes'].includes(s)) {
      push('show');
    } else if (['about', 'value_proposition', 'why_us', 'adviser', 'broker', 'process'].includes(s)) {
      push('about');
    } else if (['trust', 'trust_information', 'reviews'].includes(s)) {
      // Only include social_proof for retail/ecommerce — others skip fabricated reviews
      push('trust_block');
    } else if (['hours', 'location', 'contact', 'consultation_cta', 'quote_cta', 'order', 'booking_cta'].includes(s)) {
      push('contact');
    } else if (s === 'gallery' || s === 'past_work' || s === 'portfolio') {
      push('gallery');
    }
  }
  if (!seen.has('about')) push('about');
  if (!seen.has('contact')) push('contact');
  return mapped;
}

/**
 * Phase 3 handoff resource needs derived from plan.
 * @param {import('./storeCompositionPlan.js').StoreCompositionPlan} plan
 * @param {import('./brandStyleProfile.js').BrandStyleProfile} brand
 */
export function buildResourceNeeds(plan, brand) {
  const negatives = brand?.negativeResourceCharacteristics || [];
  const palette = [...(brand?.primaryColors || []), ...(brand?.secondaryColors || [])];
  const base = {
    toneHints: [brand?.tone, brand?.graphicLanguage].filter(Boolean),
    negativeHints: negatives,
    paletteHints: palette,
  };
  return {
    heroImageNeed: {
      purpose: 'hero',
      subjectHints: plan.resourceRequirements?.[0]?.subjectHints || [],
      ...base,
    },
    serviceImageNeeds:
      plan.offeringPresentation === 'service_list'
        ? [{ purpose: 'service', subjectHints: ['service', 'professional'], ...base }]
        : [],
    productImageNeeds:
      plan.offeringPresentation === 'product_grid' || plan.offeringPresentation === 'menu'
        ? [{ purpose: plan.offeringPresentation === 'menu' ? 'dish' : 'product', subjectHints: [plan.offeringPresentation], ...base }]
        : [],
    backgroundNeed: { purpose: 'background', subjectHints: [brand?.imageryDirection || 'neutral'], ...base },
    galleryNeeds:
      (plan.sectionPriority || []).includes('gallery') || (plan.sectionPriority || []).includes('past_work')
        ? [{ purpose: 'gallery', subjectHints: ['workspace', 'results'], ...base }]
        : [],
  };
}

/**
 * @param {Record<string, any>} input - draft.input / generation input
 * @param {{ retry?: number }} [opts]
 */
export function composeGroundedStoreIntelligence(input = {}, opts = {}) {
  const retry = opts.retry || 0;
  const businessName = String(input.businessName || input.storeName || '').trim() || null;
  const category = String(input.category || input.storeType || input.businessType || '').trim() || null;
  const offerings = collectEvidenceOfferings(input);

  const evidence = createEmptyEvidenceBundle({
    intakeEvidenceId: input.evidenceId || input.intakeEvidenceId || null,
    sources: [],
  });
  if (businessName) {
    addExtractedFact(evidence, 'businessName', businessName, {
      sourceType: input.ocrRawText || input.photoDataUrl ? 'uploaded_flyer' : 'user_description',
      status: 'VERIFIED',
      confidence: 0.9,
    });
    evidence.sources.push({
      id: 'src-name',
      sourceType: input.ocrRawText ? 'ocr' : 'user_description',
      label: 'businessName',
    });
  }
  if (category) {
    addExtractedFact(evidence, 'primaryCategory', category, {
      sourceType: 'user_description',
      status: input.category ? 'VERIFIED' : 'INFERRED',
      confidence: input.category ? 0.85 : 0.6,
    });
  }
  for (const [i, name] of offerings.entries()) {
    addExtractedFact(evidence, `offering_${i}`, name, {
      sourceType: input.ocrRawText ? 'ocr' : 'user_description',
      status: 'VERIFIED',
      confidence: 0.8,
    });
  }
  for (const key of ['phone', 'email', 'address', 'location', 'website', 'websiteUrl', 'openingHours', 'hours']) {
    const v = input[key];
    if (v != null && String(v).trim()) {
      addExtractedFact(evidence, key === 'websiteUrl' ? 'website' : key, String(v).trim(), {
        sourceType: input.ocrRawText ? 'ocr' : 'owner_input',
        status: 'VERIFIED',
        confidence: 0.85,
      });
    }
  }
  if (input.primaryColor || input.brandColors?.primary) {
    addVisualSignal(evidence, 'brandPrimary', input.primaryColor || input.brandColors.primary, {
      sourceType: 'vision',
      status: 'INFERRED',
      confidence: 0.7,
    });
  }

  let archetype = inferArchetypeFromHints({
    category,
    businessName,
    businessType: input.businessType || input.storeType,
  });
  // Do not default weak signals to PRODUCT_RETAIL / ECOMMERCE
  if (archetype === 'UNKNOWN' && offerings.length > 0) {
    const joined = offerings.join(' ').toLowerCase();
    if (/\b(loan|mortgage|refinance|broker)\b/.test(joined)) archetype = 'FINANCIAL_SERVICE';
    else if (/\b(egg|brunch|coffee|latte|menu|noodle|pizza)\b/.test(joined)) archetype = 'CAFE';
    else if (/\b(plumb\w*|electr\w*|repair|quote|install|drain|hot water)\b/.test(joined)) {
      archetype = 'HOME_SERVICE';
    }
    else if (/\b(cut|colour|color|blow|manicure|facial)\b/.test(joined)) archetype = 'APPOINTMENT_SERVICE';
  }

  const defaults = getArchetypeDefaults(archetype);
  const brand = buildBrandFromInput(input, archetype);

  const understanding = createEmptyBusinessUnderstanding({
    identity: {
      name: storeField(businessName, {
        status: businessName ? 'VERIFIED' : 'UNKNOWN',
        sourceType: 'user_description',
        confidence: businessName ? 0.9 : null,
      }),
      location: storeField(input.location || input.address || null, {
        status: input.location || input.address ? 'VERIFIED' : 'UNKNOWN',
      }),
      phone: storeField(input.phone || null, { status: input.phone ? 'VERIFIED' : 'UNKNOWN' }),
      email: storeField(input.email || null, { status: input.email ? 'VERIFIED' : 'UNKNOWN' }),
      website: storeField(input.website || input.websiteUrl || null, {
        status: input.website || input.websiteUrl ? 'VERIFIED' : 'UNKNOWN',
      }),
      slogan: storeField(
        toDisplayReadyCopy(input.slogan || input.tagline || null) || null,
        { status: input.slogan || input.tagline ? 'VERIFIED' : 'UNKNOWN' },
      ),
    },
    businessModel: storeField(defaults.transactionHint, { status: 'INFERRED', confidence: 0.7 }),
    industry: storeField(category, { status: category ? 'INFERRED' : 'UNKNOWN', confidence: 0.65 }),
    category: storeField(category, { status: category ? 'VERIFIED' : 'UNKNOWN', confidence: 0.7 }),
    archetype,
    offerings: offerings.map((name) =>
      storeField(name, { status: 'VERIFIED', sourceType: 'ocr', confidence: 0.8 }),
    ),
    customerIntent: [...defaults.customerIntent],
    transactionModel: storeField(defaults.transactionHint, { status: 'INFERRED', confidence: 0.7 }),
    locationModel: storeField(
      input.location || input.address ? 'physical' : 'hybrid',
      { status: 'INFERRED' },
    ),
    trustModel: storeField(
      archetype === 'FINANCIAL_SERVICE' ? 'adviser_credibility' : 'customer_and_reviews',
      { status: 'INFERRED' },
    ),
    primaryActions: [...defaults.primaryCTAs],
    secondaryActions: [...defaults.secondaryCTAs],
    importantInformation: [...defaults.sectionPriority].slice(0, 6),
    evidenceRefs: evidence.sources.map((s) => s.id),
    confidence: offerings.length || businessName ? 0.75 : 0.4,
  });

  let plan = buildStoreCompositionPlan({
    understanding,
    brand,
    categoryHint: category,
    businessName,
  });
  // Prefer archetype CTA over retail classifier leftovers
  plan.primaryCTA = defaults.primaryCTAs[0] || plan.primaryCTA;
  plan.secondaryCTA = defaults.secondaryCTAs[0] || plan.secondaryCTA;
  plan.websiteSectionTypes = mapSectionsToWebsiteTypes(plan.sectionPriority);
  plan.resourceNeeds = buildResourceNeeds(plan, brand);
  plan.groundedOfferings = offerings;
  plan.skipFabricatedReviews = !['RETAIL', 'ECOMMERCE'].includes(archetype);
  plan.skipGenericUsp = true;

  let gate = evaluateCompositionGenericness(plan, {
    offeringsCount: offerings.length,
    ignoredOfferings: false,
    hasBusinessName: Boolean(businessName),
    hasCategory: Boolean(category),
  });

  // Bounded repair: fix CTA / archetype mismatches without rebuilding evidence
  let attempts = 0;
  while (!gate.ok && attempts < MAX_GATE_RETRIES) {
    attempts += 1;
    if (gate.reasons.includes('cta_retail_mismatch') || gate.reasons.includes('forbidden_add_to_cart')) {
      plan.primaryCTA = defaults.primaryCTAs[0];
      plan.secondaryCTA = defaults.secondaryCTAs[0] || null;
    }
    if (gate.reasons.includes('archetype_unknown') && offerings.length > 0) {
      understanding.archetype = archetype === 'UNKNOWN' ? 'HYBRID' : archetype;
      plan = buildStoreCompositionPlan({ understanding, brand, categoryHint: category, businessName });
      plan.primaryCTA = getArchetypeDefaults(understanding.archetype).primaryCTAs[0];
      plan.websiteSectionTypes = mapSectionsToWebsiteTypes(plan.sectionPriority);
      plan.resourceNeeds = buildResourceNeeds(plan, brand);
      plan.groundedOfferings = offerings;
      plan.skipFabricatedReviews = !['RETAIL', 'ECOMMERCE'].includes(understanding.archetype);
      plan.skipGenericUsp = true;
    }
    if (gate.reasons.includes('theme_generic_fallback') && brand.primaryColors.length === 0) {
      const pal = categoryPalette(understanding.archetype || archetype);
      brand.primaryColors = pal.primaryColors;
      brand.secondaryColors = pal.secondaryColors;
      brand.sourceConfidence = Math.max(brand.sourceConfidence, 0.55);
      brand.tone = pal.tone;
      brand.graphicLanguage = pal.graphicLanguage;
      plan = buildStoreCompositionPlan({ understanding, brand, categoryHint: category, businessName });
      plan.primaryCTA = getArchetypeDefaults(understanding.archetype || archetype).primaryCTAs[0];
      plan.websiteSectionTypes = mapSectionsToWebsiteTypes(plan.sectionPriority);
      plan.resourceNeeds = buildResourceNeeds(plan, brand);
      plan.groundedOfferings = offerings;
      plan.skipFabricatedReviews = !['RETAIL', 'ECOMMERCE'].includes(understanding.archetype || archetype);
      plan.skipGenericUsp = true;
    }
    gate = evaluateCompositionGenericness(plan, {
      offeringsCount: offerings.length,
      hasBusinessName: Boolean(businessName),
      hasCategory: Boolean(category),
      retry,
    });
  }

  return {
    evidenceBundle: evidence,
    understanding,
    brand,
    plan,
    gate,
    gateAttempts: attempts,
    groundedOfferings: offerings,
  };
}

/**
 * Apply composition onto resolveGenerationParams result (mutates + returns).
 * @param {Record<string, any>} params
 * @param {ReturnType<typeof composeGroundedStoreIntelligence>} composition
 */
export function applyCompositionToGenerationParams(params, composition) {
  if (!params || !composition?.plan) return params;
  const { plan, understanding, brand, groundedOfferings } = composition;
  params.primaryCTA = plan.primaryCTA || params.primaryCTA;
  params.secondaryCTA = plan.secondaryCTA || null;
  params.groundedComposition = {
    archetype: plan.archetype,
    primaryCTA: plan.primaryCTA,
    secondaryCTA: plan.secondaryCTA,
    sectionPriority: plan.sectionPriority,
    websiteSectionTypes: plan.websiteSectionTypes,
    themeSpec: plan.themeSpec,
    resourceNeeds: plan.resourceNeeds,
    groundedOfferings,
    skipFabricatedReviews: plan.skipFabricatedReviews,
    skipGenericUsp: plan.skipGenericUsp,
    offeringPresentation: plan.offeringPresentation,
    gate: composition.gate,
  };
  if (plan.themeSpec?.primary) {
    params.primaryColor = params.primaryColor || plan.themeSpec.primary;
    params.brandColors = {
      ...(params.brandColors && typeof params.brandColors === 'object' ? params.brandColors : {}),
      primary: plan.themeSpec.primary,
      secondary: plan.themeSpec.secondary || undefined,
      accent: plan.themeSpec.accent || undefined,
    };
  }
  // Prefer evidence offerings over AI invent when we have them
  if (Array.isArray(groundedOfferings) && groundedOfferings.length > 0) {
    params.seedItems = groundedOfferings.map((name) => ({ name, description: null, price: null }));
    if (params.mode === 'ai') {
      params.mode = 'seed';
      params.groundedForcedSeedFromEvidence = true;
    }
  }
  if (!params.storeType && understanding?.category?.value) {
    params.storeType = String(understanding.category.value);
  }
  if (!params.businessType && understanding?.category?.value) {
    params.businessType = String(understanding.category.value);
  }
  params.businessArchetype = plan.archetype;
  params.brandStyleProfile = brand;
  return params;
}

/**
 * Build catalog products from grounded offerings (no invented packages).
 * @param {string[]} offerings
 * @param {{ draftId?: string, currencyCode?: string }} [opts]
 */
export function buildCatalogFromGroundedOfferings(offerings, opts = {}) {
  const draftId = opts.draftId || 'draft';
  const currency = opts.currencyCode || 'AUD';
  const products = (offerings || []).map((name, i) => ({
    id: `item_${draftId}_g_${i}`,
    name,
    description: null,
    price: null,
    currencyCode: currency,
    categoryId: `cat_${draftId}_0`,
    imageUrl: null,
    origin: 'evidence',
    provenanceStatus: 'VERIFIED',
  }));
  return {
    profile: {},
    categories: products.length
      ? [{ id: `cat_${draftId}_0`, name: 'Offerings', sortOrder: 0 }]
      : [],
    products,
    meta: {
      catalogSource: 'grounded_evidence',
      groundedStoreCreation: true,
      evidenceOfferingCount: products.length,
    },
  };
}

export { toDisplayReadyCopy };

export default {
  composeGroundedStoreIntelligence,
  applyCompositionToGenerationParams,
  collectEvidenceOfferings,
  extractOfferingLinesFromText,
  mapSectionsToWebsiteTypes,
  buildResourceNeeds,
  buildCatalogFromGroundedOfferings,
  toDisplayReadyCopy,
};

/**
 * Deterministic Store Readiness V1 rule registry.
 * Pure functions over a normalized store input — no LLM, no DB access.
 */

import { createFinding } from './findings.js';
import { storeReadinessDestinations } from './destinations.js';
import { runVerticalReadinessRules } from './verticalRules.js';

const PLACEHOLDER_RE =
  /^(placeholder|tbd|todo|n\/a|na|test|sample|lorem|xxx|your (business|store|company)|coming soon)$/i;

function isBlank(v) {
  return v == null || String(v).trim() === '';
}

function hasText(v) {
  return !isBlank(v);
}

function isPlaceholderText(v) {
  if (isBlank(v)) return false;
  return PLACEHOLDER_RE.test(String(v).trim());
}

function parseHours(hours) {
  if (!hours) return null;
  if (typeof hours === 'string') {
    try {
      return JSON.parse(hours);
    } catch {
      return null;
    }
  }
  return typeof hours === 'object' ? hours : null;
}

function hasOpeningHours(hours) {
  const parsed = parseHours(hours);
  if (!parsed || typeof parsed !== 'object') return false;
  const days = Object.values(parsed);
  return days.some((d) => {
    if (!d) return false;
    if (typeof d === 'string' && d.trim()) return true;
    if (typeof d === 'object' && (d.open || d.close || d.from || d.to)) return true;
    return false;
  });
}

function mediaUrlLooksValid(url) {
  if (isBlank(url)) return false;
  const s = String(url).trim();
  if (s.startsWith('data:')) return false;
  if (s.includes('://') || s.startsWith('/') || s.startsWith('blob:')) {
    // Reject obvious local filesystem paths
    if (/^[a-zA-Z]:\\/.test(s) || s.startsWith('file:')) return false;
    return true;
  }
  return false;
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {object} store - normalized store input from aggregator
 * @returns {import('./types.js').StoreReadinessFinding[]}
 */
export function runStoreReadinessRules(store) {
  const storeId = String(store.id || store.storeId || '');
  const dest = storeReadinessDestinations(storeId, store.draftId || null);
  const generatedAt = store.generatedAt || new Date().toISOString();
  /** @type {import('./types.js').StoreReadinessFinding[]} */
  const findings = [];

  const push = (partial) => {
    findings.push(
      createFinding({
        ...partial,
        generatedAt,
      }),
    );
  };

  // —— Business profile ——
  if (!hasText(store.name)) {
    push({
      code: 'PROFILE_MISSING_NAME',
      severity: 'critical',
      category: 'businessProfile',
      title: 'Add your business name',
      explanation: 'Customers need a clear business name before the store can go live.',
      evidence: ['name is empty'],
      affectedObject: { type: 'store', id: storeId, label: 'Business name' },
      recommendedActionType: 'navigate',
      destination: dest.businessProfile,
      pilCanAssist: true,
    });
  } else if (isPlaceholderText(store.name)) {
    push({
      code: 'PROFILE_PLACEHOLDER_NAME',
      severity: 'important',
      category: 'businessProfile',
      title: 'Replace placeholder business name',
      explanation: 'The business name looks like placeholder text.',
      evidence: [`name="${String(store.name).slice(0, 80)}"`],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'suggest_edit',
      destination: dest.businessProfile,
      pilCanAssist: true,
    });
  }

  if (!hasText(store.category) && !hasText(store.type)) {
    push({
      code: 'PROFILE_MISSING_CATEGORY',
      severity: 'important',
      category: 'businessProfile',
      title: 'Set a business category',
      explanation: 'Category helps discovery and storefront templates.',
      evidence: ['category and type are empty'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.businessProfile,
      pilCanAssist: true,
    });
  }

  if (!hasText(store.description)) {
    push({
      code: 'PROFILE_MISSING_DESCRIPTION',
      severity: 'important',
      category: 'businessProfile',
      title: 'Add a business description',
      explanation: 'A short description helps customers understand what you offer.',
      evidence: ['description is empty'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'generate_content',
      destination: dest.businessProfile,
      pilCanAssist: true,
    });
  } else if (isPlaceholderText(store.description)) {
    push({
      code: 'PROFILE_PLACEHOLDER_DESCRIPTION',
      severity: 'improvement',
      category: 'businessProfile',
      title: 'Replace placeholder description',
      explanation: 'Description appears to be placeholder content.',
      evidence: [`description length=${String(store.description).length}`],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'generate_content',
      destination: dest.businessProfile,
      pilCanAssist: true,
    });
  }

  const hasPhone = hasText(store.phone);
  const hasEmail = hasText(store.email);
  if (!hasPhone && !hasEmail) {
    push({
      code: 'PROFILE_MISSING_CONTACT',
      severity: 'important',
      category: 'contactAndLocation',
      title: 'Add a phone or email',
      explanation: 'Customers need at least one way to reach you.',
      evidence: ['phone and email are empty'],
      affectedObject: { type: 'contact', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.contact,
      pilCanAssist: true,
    });
  }

  const hasAddress = hasText(store.address) || hasText(store.location);
  const hasServiceArea = hasText(store.serviceArea) || store.serviceRadiusKm != null;
  if (!hasAddress && !hasServiceArea) {
    push({
      code: 'PROFILE_MISSING_LOCATION',
      severity: 'important',
      category: 'contactAndLocation',
      title: 'Add an address or service area',
      explanation: 'Location or service area helps customers find and trust you.',
      evidence: ['address/location and service area are empty'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.contact,
      pilCanAssist: true,
    });
  }

  if (!hasOpeningHours(store.hours)) {
    push({
      code: 'PROFILE_MISSING_HOURS',
      severity: 'improvement',
      category: 'businessProfile',
      title: 'Add opening hours',
      explanation: 'Opening hours set expectations for when you are available.',
      evidence: ['hours missing or empty'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.businessProfile,
      pilCanAssist: true,
    });
  }

  // —— Branding ——
  const logoUrl = store.logoUrl || store.logo;
  if (!mediaUrlLooksValid(logoUrl)) {
    push({
      code: 'BRANDING_MISSING_LOGO',
      severity: 'important',
      category: 'branding',
      title: 'Add a logo',
      explanation: 'A logo strengthens brand recognition on your storefront.',
      evidence: [isBlank(logoUrl) ? 'logoUrl empty' : 'logoUrl invalid'],
      affectedObject: { type: 'media', id: storeId, label: 'logo' },
      recommendedActionType: 'navigate',
      destination: dest.branding,
      pilCanAssist: true,
    });
  }

  const heroImage = store.heroImageUrl || store.coverImage || store.bannerUrl;
  const heroVideo = store.heroVideoUrl || store.videoUrl;
  const hasHeroImage = mediaUrlLooksValid(heroImage);
  const hasHeroVideo = mediaUrlLooksValid(heroVideo);
  if (!hasHeroImage && !hasHeroVideo) {
    push({
      code: 'BRANDING_MISSING_HERO',
      severity: 'important',
      category: 'branding',
      title: 'Add a hero image or video',
      reason: 'No approved hero image was found.',
      recommendation: 'Upload at least one approved hero image.',
      explanation: 'Hero media is the first visual customers see on your storefront.',
      evidence: {
        heroCount: 0,
        approvedHero: false,
        hasHeroImage: false,
        hasHeroVideo: false,
      },
      affectedObject: { type: 'media', id: storeId, label: 'hero' },
      recommendedActionType: 'navigate',
      destination: dest.heroImages || dest.branding,
      destinationKey: 'heroImages',
      destinationLabel: 'Open Hero Images',
      pilCanAssist: true,
    });
  }

  if (hasHeroVideo) {
    const playable = store.heroVideoPlayable;
    const failed = store.heroMediaFailed === true || store.heroVideoFailed === true;
    if (failed || playable === false) {
      push({
        code: 'BRANDING_HERO_VIDEO_NOT_PLAYABLE',
        severity: 'critical',
        category: 'branding',
        title: 'Fix hero video playback',
        explanation: 'Hero video is present but marked as not playable or failed.',
        evidence: [
          failed ? 'heroMediaFailed=true' : 'heroVideoPlayable=false',
          `urlHost=${safeUrlHost(heroVideo)}`,
        ],
        affectedObject: { type: 'media', id: storeId, label: 'heroVideo' },
        recommendedActionType: 'run_validation',
        destination: dest.branding,
        pilCanAssist: true,
      });
    }
  }

  if (hasHeroImage && store.heroImageWidth != null && store.heroImageWidth < 640) {
    push({
      code: 'BRANDING_HERO_LOW_RESOLUTION',
      severity: 'improvement',
      category: 'branding',
      title: 'Upgrade low-resolution hero image',
      explanation: 'Hero image width is below 640px, which can look soft on large screens.',
      evidence: [`heroImageWidth=${store.heroImageWidth}`],
      affectedObject: { type: 'media', id: storeId, label: 'heroImage' },
      recommendedActionType: 'suggest_edit',
      destination: dest.branding,
      pilCanAssist: true,
    });
  }

  // —— Catalog ——
  const products = Array.isArray(store.products) ? store.products : [];
  const activeProducts = products.filter((p) => !p.deletedAt && p.isPublished !== false);
  const draftProducts = products.filter((p) => !p.deletedAt && p.isPublished === false);

  if (activeProducts.length === 0 && products.filter((p) => !p.deletedAt).length === 0) {
    push({
      code: 'CATALOG_EMPTY',
      severity: 'critical',
      category: 'catalog',
      title: 'Add at least one catalog item',
      explanation: 'A store needs at least one product or service to be useful to customers.',
      evidence: ['no products'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.catalog,
      pilCanAssist: true,
    });
  } else if (activeProducts.length === 0) {
    push({
      code: 'CATALOG_NO_ACTIVE_ITEMS',
      severity: 'critical',
      category: 'catalog',
      title: 'Publish at least one catalog item',
      explanation: 'All items are draft or unpublished — customers cannot buy or enquire.',
      evidence: [`draftCount=${draftProducts.length}`],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'request_approval',
      destination: dest.catalog,
      pilCanAssist: true,
    });
  }

  const missingName = [];
  const missingPrice = [];
  const missingDesc = [];
  const missingImage = [];
  const emptyCategory = [];

  for (const p of activeProducts.length ? activeProducts : products.filter((x) => !x.deletedAt)) {
    const pid = String(p.id || '');
    const label = String(p.name || pid || 'item').slice(0, 80);
    if (!hasText(p.name)) missingName.push({ id: pid, label });
    if (p.price == null || Number.isNaN(Number(p.price))) missingPrice.push({ id: pid, label });
    if (!hasText(p.description)) missingDesc.push({ id: pid, label });
    if (!mediaUrlLooksValid(p.imageUrl || p.image)) missingImage.push({ id: pid, label });
    if (!hasText(p.category) && !hasText(p.categoryName)) emptyCategory.push({ id: pid, label });
  }

  if (missingName.length) {
    push({
      code: 'CATALOG_MISSING_NAME',
      severity: 'critical',
      category: 'catalog',
      title: `Add names to ${missingName.length} item${missingName.length === 1 ? '' : 's'}`,
      explanation: 'Catalog items without names cannot be shown clearly to customers.',
      evidence: missingName.slice(0, 5).map((x) => `productId=${x.id}`),
      affectedObject: { type: 'product', id: missingName[0].id, label: missingName[0].label },
      recommendedActionType: 'suggest_edit',
      destination: dest.catalogFilterIncomplete,
      pilCanAssist: true,
    });
  }

  if (missingPrice.length) {
    push({
      code: 'CATALOG_MISSING_PRICE',
      severity: 'important',
      category: 'catalog',
      title: `Add prices to ${missingPrice.length} menu item${missingPrice.length === 1 ? '' : 's'}`,
      explanation: 'Items without prices leave customers unsure how to buy.',
      evidence: missingPrice.slice(0, 8).map((x) => `${x.label || x.id}`),
      affectedObject: { type: 'product', id: missingPrice[0].id, label: missingPrice[0].label },
      recommendedActionType: 'suggest_edit',
      destination: dest.catalogFilterIncomplete,
      pilCanAssist: true,
    });
  }

  if (missingDesc.length >= 3 || (missingDesc.length > 0 && missingDesc.length === activeProducts.length)) {
    push({
      code: 'CATALOG_MISSING_DESCRIPTION',
      severity: missingDesc.length === activeProducts.length ? 'important' : 'improvement',
      category: 'catalog',
      title: `Add descriptions to ${missingDesc.length} item${missingDesc.length === 1 ? '' : 's'}`,
      explanation: 'Descriptions help customers choose the right product or service.',
      evidence: [`missingDescriptionCount=${missingDesc.length}`],
      affectedObject: { type: 'product', id: missingDesc[0].id, label: missingDesc[0].label },
      recommendedActionType: 'generate_content',
      destination: dest.catalogFilterIncomplete,
      pilCanAssist: true,
    });
  }

  if (missingImage.length) {
    push({
      code: 'CATALOG_MISSING_IMAGE',
      severity: 'improvement',
      category: 'catalog',
      title: `Add images to ${missingImage.length} item${missingImage.length === 1 ? '' : 's'}`,
      explanation: 'Product images improve conversion and trust.',
      evidence: [`missingImageCount=${missingImage.length}`],
      affectedObject: { type: 'product', id: missingImage[0].id, label: missingImage[0].label },
      recommendedActionType: 'navigate',
      destination: dest.catalogFilterIncomplete,
      pilCanAssist: true,
    });
  }

  if (emptyCategory.length >= 2) {
    push({
      code: 'CATALOG_EMPTY_CATEGORY',
      severity: 'improvement',
      category: 'catalog',
      title: 'Assign categories to catalog items',
      explanation: 'Empty categories make browsing harder for customers.',
      evidence: [`uncategorizedCount=${emptyCategory.length}`],
      affectedObject: { type: 'product', id: emptyCategory[0].id },
      recommendedActionType: 'suggest_edit',
      destination: dest.catalog,
      pilCanAssist: true,
    });
  }

  if (draftProducts.length > 0 && activeProducts.length > 0) {
    push({
      code: 'CATALOG_DRAFT_ITEMS',
      severity: 'optional',
      category: 'catalog',
      title: `${draftProducts.length} draft item${draftProducts.length === 1 ? '' : 's'} waiting`,
      explanation: 'Draft items are not visible to customers until published.',
      evidence: [`draftCount=${draftProducts.length}`],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'request_approval',
      destination: dest.catalog,
      pilCanAssist: true,
    });
  }

  // Duplicate names (deterministic exact match after normalize)
  const nameMap = new Map();
  for (const p of products.filter((x) => !x.deletedAt && hasText(x.name))) {
    const key = normalizeName(p.name);
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key).push(p);
  }
  const dupGroups = [...nameMap.values()].filter((g) => g.length > 1);
  if (dupGroups.length) {
    const sample = dupGroups[0];
    push({
      code: 'CATALOG_DUPLICATE_ITEMS',
      severity: 'improvement',
      category: 'catalog',
      title: 'Review duplicate catalog items',
      explanation: 'Some items share the same name, which can confuse customers.',
      evidence: [`duplicateGroups=${dupGroups.length}`, `example="${sample[0].name}"`],
      affectedObject: { type: 'product', id: String(sample[0].id), label: sample[0].name },
      recommendedActionType: 'run_validation',
      destination: dest.catalog,
      pilCanAssist: true,
    });
  }

  // Service tiers without sellable rows
  const serviceTiers = Array.isArray(store.serviceOptions) ? store.serviceOptions : [];
  const badTiers = serviceTiers.filter(
    (t) =>
      t &&
      (isBlank(t.name) ||
        t.price == null ||
        Number.isNaN(Number(t.price)) ||
        (Array.isArray(t.rows) && t.rows.length === 0)),
  );
  if (badTiers.length) {
    push({
      code: 'CATALOG_INVALID_SERVICE_TIERS',
      severity: 'important',
      category: 'catalog',
      title: 'Fix service options without sellable rows',
      explanation: 'Service duration/price tiers need valid sellable rows.',
      evidence: [`invalidTierCount=${badTiers.length}`],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'suggest_edit',
      destination: dest.catalog,
      pilCanAssist: true,
    });
  }

  // —— Storefront ——
  const visibility = String(store.visibility || store.status || '').toLowerCase();
  const isPublic =
    store.isPublic === true ||
    store.published === true ||
    visibility === 'public' ||
    visibility === 'published' ||
    visibility === 'live';
  const isHidden =
    store.isPublic === false ||
    store.published === false ||
    visibility === 'hidden' ||
    visibility === 'private' ||
    visibility === 'draft' ||
    visibility === 'unpublished';

  if (isHidden || (!isPublic && visibility !== 'live')) {
    // Treat missing published flag as hidden for readiness purposes when explicitly false/draft
    if (store.published === false || store.isPublic === false || ['hidden', 'private', 'draft', 'unpublished'].includes(visibility)) {
      push({
        code: 'STOREFRONT_HIDDEN',
        severity: 'critical',
        category: 'storefront',
        title: 'Store is not publicly visible',
        explanation: 'Customers cannot access a hidden or unpublished storefront.',
        evidence: [
          `published=${String(store.published)}`,
          `isPublic=${String(store.isPublic)}`,
          `visibility=${visibility || 'unset'}`,
        ],
        affectedObject: { type: 'store', id: storeId },
        recommendedActionType: 'request_approval',
        destination: dest.storefront,
        pilCanAssist: true,
      });
    }
  }

  const cta = store.cta || store.primaryCta || null;
  const ctaLabel = cta?.label || store.ctaLabel;
  const ctaDest = cta?.destination || cta?.url || store.ctaUrl || store.ctaDestination;
  if (!hasText(ctaLabel) && !hasText(ctaDest)) {
    push({
      code: 'STOREFRONT_MISSING_CTA',
      severity: 'important',
      category: 'storefront',
      title: 'Configure a primary customer action',
      explanation: 'A clear CTA (book, enquire, shop) guides customers what to do next.',
      evidence: ['primary CTA label and destination missing'],
      affectedObject: { type: 'cta', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.storefront,
      pilCanAssist: true,
    });
  } else if (hasText(ctaDest) && !isValidCtaDestination(ctaDest)) {
    push({
      code: 'STOREFRONT_INVALID_CTA',
      severity: 'important',
      category: 'storefront',
      title: 'Fix CTA destination',
      explanation: 'The primary CTA points to an invalid or empty destination.',
      evidence: [`destinationHost=${safeUrlHost(ctaDest)}`],
      affectedObject: { type: 'cta', id: storeId },
      recommendedActionType: 'run_validation',
      destination: dest.storefront,
      pilCanAssist: true,
    });
  }

  if (store.blockingMediaState === true || store.knownBlockingMedia === true) {
    push({
      code: 'STOREFRONT_BLOCKING_MEDIA',
      severity: 'critical',
      category: 'storefront',
      title: 'Resolve blocking media state',
      explanation: 'Known blocking media prevents a healthy customer experience.',
      evidence: ['blockingMediaState=true'],
      affectedObject: { type: 'media', id: storeId },
      recommendedActionType: 'run_validation',
      destination: dest.branding,
      pilCanAssist: true,
    });
  }

  // —— Commerce ——
  const paths = {
    quote: store.hasQuotePath === true || store.commercePaths?.quote === true,
    booking: store.hasBookingPath === true || store.commercePaths?.booking === true,
    enquiry: store.hasEnquiryPath === true || store.commercePaths?.enquiry === true,
    checkout: store.hasCheckoutPath === true || store.commercePaths?.checkout === true,
  };
  const hasAnyPath = paths.quote || paths.booking || paths.enquiry || paths.checkout;
  // Infer enquiry path from contact
  const inferredEnquiry = hasPhone || hasEmail;
  if (!hasAnyPath && !inferredEnquiry) {
    push({
      code: 'COMMERCE_MISSING_PATH',
      severity: 'important',
      category: 'commerce',
      title: 'Set up a customer action path',
      explanation: 'Enable quote, booking, enquiry, or checkout so customers can take action.',
      evidence: ['no quote/booking/enquiry/checkout path detected'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.commerce,
      pilCanAssist: true,
    });
  }

  const notifyEmail = store.notificationEmail || store.notifyEmail;
  const notifyPhone = store.notificationPhone || store.notifyPhone;
  if (!hasText(notifyEmail) && !hasText(notifyPhone) && !hasEmail && !hasPhone) {
    push({
      code: 'COMMERCE_MISSING_NOTIFICATION',
      severity: 'important',
      category: 'commerce',
      title: 'Configure notification destination',
      explanation: 'Without a notification destination you may miss enquiries and bookings.',
      evidence: ['notification email/phone missing'],
      affectedObject: { type: 'contact', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.commerce,
      pilCanAssist: true,
    });
  }

  if (store.requiresFulfilment === true && !hasText(store.fulfilmentMethod) && !hasText(store.serviceMethod)) {
    push({
      code: 'COMMERCE_MISSING_FULFILMENT',
      severity: 'improvement',
      category: 'commerce',
      title: 'Configure fulfilment or service method',
      explanation: 'Customers need to know how delivery or service works.',
      evidence: ['requiresFulfilment=true but method empty'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'navigate',
      destination: dest.commerce,
      pilCanAssist: true,
    });
  }

  // —— Marketing (optional / growth) ——
  if (!hasText(store.tagline) && !hasText(store.slogan)) {
    push({
      code: 'MARKETING_MISSING_TAGLINE',
      severity: 'optional',
      category: 'marketing',
      title: 'Add a short tagline',
      explanation: 'A tagline makes your brand memorable on cards and search.',
      evidence: ['tagline/slogan empty'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'generate_content',
      destination: dest.marketing,
      pilCanAssist: true,
    });
  }

  // —— Trust ——
  if (store.claimsUnverified === true) {
    push({
      code: 'TRUST_UNVERIFIED_CLAIMS',
      severity: 'optional',
      category: 'trustAndCompliance',
      title: 'Review unverified business claims',
      explanation: 'Verifying ownership and details builds customer trust.',
      evidence: ['claimsUnverified=true'],
      affectedObject: { type: 'store', id: storeId },
      recommendedActionType: 'request_approval',
      destination: dest.trust,
      pilCanAssist: false,
    });
  }

  // Vertical / business-type rules (deterministic)
  findings.push(...runVerticalReadinessRules(store));

  return findings;
}

function safeUrlHost(url) {
  try {
    if (!url || typeof url !== 'string') return 'none';
    if (url.startsWith('/')) return 'relative';
    const u = new URL(url);
    return u.host || 'unknown';
  } catch {
    return 'invalid';
  }
}

function isValidCtaDestination(dest) {
  if (isBlank(dest)) return false;
  const s = String(dest).trim();
  if (s.startsWith('#') || s.startsWith('/')) return true;
  if (/^(tel:|mailto:|sms:)/i.test(s)) return true;
  return mediaUrlLooksValid(s);
}

/** Stable list of rule codes for docs/tests */
export const STORE_READINESS_RULE_CODES = [
  'PROFILE_MISSING_NAME',
  'PROFILE_PLACEHOLDER_NAME',
  'PROFILE_MISSING_CATEGORY',
  'PROFILE_MISSING_DESCRIPTION',
  'PROFILE_PLACEHOLDER_DESCRIPTION',
  'PROFILE_MISSING_CONTACT',
  'PROFILE_MISSING_LOCATION',
  'PROFILE_MISSING_HOURS',
  'BRANDING_MISSING_LOGO',
  'BRANDING_MISSING_HERO',
  'BRANDING_HERO_VIDEO_NOT_PLAYABLE',
  'BRANDING_HERO_LOW_RESOLUTION',
  'CATALOG_EMPTY',
  'CATALOG_NO_ACTIVE_ITEMS',
  'CATALOG_MISSING_NAME',
  'CATALOG_MISSING_PRICE',
  'CATALOG_MISSING_DESCRIPTION',
  'CATALOG_MISSING_IMAGE',
  'CATALOG_EMPTY_CATEGORY',
  'CATALOG_DRAFT_ITEMS',
  'CATALOG_DUPLICATE_ITEMS',
  'CATALOG_INVALID_SERVICE_TIERS',
  'STOREFRONT_HIDDEN',
  'STOREFRONT_MISSING_CTA',
  'STOREFRONT_INVALID_CTA',
  'STOREFRONT_BLOCKING_MEDIA',
  'COMMERCE_MISSING_PATH',
  'COMMERCE_MISSING_NOTIFICATION',
  'COMMERCE_MISSING_FULFILMENT',
  'MARKETING_MISSING_TAGLINE',
  'TRUST_UNVERIFIED_CLAIMS',
  'VERTICAL_RESTAURANT_MENU_COVERAGE',
  'VERTICAL_RESTAURANT_FEATURED_DISHES',
  'VERTICAL_RETAIL_PRICING',
  'VERTICAL_RETAIL_STOCK_VISIBILITY',
  'VERTICAL_SERVICE_DESCRIPTIONS',
  'VERTICAL_SERVICE_QUOTE_PATH',
  'VERTICAL_SERVICE_BOOKING',
  'VERTICAL_CREATOR_PUBLIC_PROFILE',
  'VERTICAL_CREATOR_FEATURED_WORK',
  'VERTICAL_CREATOR_CONTACT',
];

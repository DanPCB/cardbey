/**
 * Content Readiness Model — single authority for grounded store truth & readiness.
 *
 * Grounded Store Creation owns business truth.
 * Design Library owns presentation.
 *
 * Draft Content areas:
 *   Identity | Catalogue | Media | Contact | Policies | Branding | SEO
 *
 * Each area exposes: ready | needs_review | needs_media | missing | suggested_only | blocked
 */

/** @typedef {'website'|'social'|'upload'|'business_card'|'user_input'|'existing_store'|'ai_inference'|'template_fallback'|'research'|'ocr'|'none'} TruthSourceType */

/** @typedef {'verified'|'inferred'|'needs_confirmation'|'placeholder'|'suggested'} TruthStatus */

/** @typedef {'pending'|'approved'|'rejected'|'not_required'} ReviewStatus */

/** @typedef {'ready'|'needs_media'|'accepted'|'rejected'|'placeholder'} MediaStatus */

/** @typedef {'eligible'|'allowed_after_approval'|'blocked'|'not_applicable'} PublishEligibility */

/** @typedef {'ready'|'needs_review'|'needs_media'|'missing'|'suggested_only'|'blocked'} AreaReadiness */

/**
 * @typedef {object} BusinessTruth
 * @property {TruthSourceType} source
 * @property {string} [sourceRef]
 * @property {string} [sourceExcerpt]
 * @property {number} confidence
 * @property {ReviewStatus} reviewStatus
 * @property {MediaStatus} [mediaStatus]
 * @property {number} [mediaMatchScore]
 * @property {string} [lastVerified]
 * @property {PublishEligibility} publishEligibility
 * @property {TruthStatus} status
 * @property {boolean} [requiresConfirmation]
 */

/**
 * @typedef {object} ContentAreaReadiness
 * @property {AreaReadiness} state
 * @property {string[]} issues
 * @property {number} [readyCount]
 * @property {number} [totalCount]
 */

/**
 * @typedef {object} ContentReadinessModel
 * @property {ContentAreaReadiness} identity
 * @property {ContentAreaReadiness} catalogue
 * @property {ContentAreaReadiness} media
 * @property {ContentAreaReadiness} contact
 * @property {ContentAreaReadiness} policies
 * @property {ContentAreaReadiness} branding
 * @property {ContentAreaReadiness} seo
 * @property {'ready'|'needs_attention'|'blocked'} overall
 * @property {object} ownerReviewSummary
 * @property {string} computedAt
 */

export const AREA_STATES = Object.freeze([
  'ready',
  'needs_review',
  'needs_media',
  'missing',
  'suggested_only',
  'blocked',
]);

/**
 * @param {Partial<BusinessTruth> & { source?: string }} [partial]
 * @returns {BusinessTruth}
 */
export function createBusinessTruth(partial = {}) {
  const source = /** @type {TruthSourceType} */ (partial.source || 'none');
  const confidence =
    typeof partial.confidence === 'number' && Number.isFinite(partial.confidence)
      ? Math.max(0, Math.min(1, partial.confidence))
      : 0;
  const status = /** @type {TruthStatus} */ (partial.status || inferStatusFromSource(source, confidence));
  const reviewStatus = /** @type {ReviewStatus} */ (
    partial.reviewStatus ||
      (status === 'needs_confirmation' || status === 'suggested' ? 'pending' : 'not_required')
  );
  const requiresConfirmation =
    partial.requiresConfirmation ??
    (reviewStatus === 'pending' || status === 'needs_confirmation' || status === 'suggested');

  return {
    source,
    ...(partial.sourceRef ? { sourceRef: String(partial.sourceRef) } : {}),
    ...(partial.sourceExcerpt ? { sourceExcerpt: String(partial.sourceExcerpt).slice(0, 400) } : {}),
    confidence,
    reviewStatus,
    ...(partial.mediaStatus ? { mediaStatus: partial.mediaStatus } : {}),
    ...(typeof partial.mediaMatchScore === 'number' ? { mediaMatchScore: partial.mediaMatchScore } : {}),
    lastVerified: partial.lastVerified || new Date().toISOString(),
    publishEligibility:
      /** @type {PublishEligibility} */ (
        partial.publishEligibility ||
          inferPublishEligibility({ status, reviewStatus, confidence, mediaStatus: partial.mediaStatus })
      ),
    status,
    requiresConfirmation,
  };
}

/**
 * @param {TruthSourceType} source
 * @param {number} confidence
 * @returns {TruthStatus}
 */
function inferStatusFromSource(source, confidence) {
  if (source === 'template_fallback' || source === 'none') return 'placeholder';
  if (source === 'ai_inference') return confidence >= 0.7 ? 'inferred' : 'needs_confirmation';
  if (source === 'website' || source === 'upload' || source === 'ocr' || source === 'research' || source === 'user_input' || source === 'existing_store' || source === 'business_card' || source === 'social') {
    return confidence >= 0.75 ? 'verified' : 'needs_confirmation';
  }
  return 'needs_confirmation';
}

/**
 * @param {{ status: TruthStatus, reviewStatus: ReviewStatus, confidence: number, mediaStatus?: MediaStatus }} args
 * @returns {PublishEligibility}
 */
function inferPublishEligibility({ status, reviewStatus, confidence, mediaStatus }) {
  if (status === 'placeholder') return 'blocked';
  if (mediaStatus === 'needs_media' || mediaStatus === 'rejected') return 'allowed_after_approval';
  if (reviewStatus === 'rejected') return 'blocked';
  if (reviewStatus === 'pending' || status === 'needs_confirmation' || status === 'suggested') {
    return 'allowed_after_approval';
  }
  if (status === 'verified' && confidence >= 0.75 && reviewStatus !== 'pending') return 'eligible';
  if (status === 'inferred' && confidence >= 0.7) return 'allowed_after_approval';
  return 'allowed_after_approval';
}

/**
 * Map catalogSource / contentOrigin → truth source.
 * @param {object} item
 * @param {object} [meta]
 * @returns {TruthSourceType}
 */
export function resolveTruthSourceFromItem(item = {}, meta = {}) {
  const origin = String(item.contentOrigin || meta.contentOrigin || '').toLowerCase();
  const catalogSource = String(item.catalogSource || meta.catalogSource || '').toLowerCase();
  if (origin === 'suggested' || catalogSource === 'generated' || catalogSource === 'ai' || catalogSource === 'template' || catalogSource === 'seed') {
    if (catalogSource === 'template' || catalogSource === 'seed') return 'template_fallback';
    return 'ai_inference';
  }
  if (catalogSource === 'research' || origin === 'sourced') return 'research';
  if (catalogSource === 'user_upload' || catalogSource === 'ocr') return 'ocr';
  if (catalogSource === 'website') return 'website';
  return origin === 'sourced' ? 'research' : 'ai_inference';
}

/**
 * Stamp Business Truth onto a catalog/product/media asset.
 * @param {object} item
 * @param {object} [meta]
 * @returns {object}
 */
export function stampBusinessTruthOnItem(item, meta = {}) {
  if (!item || typeof item !== 'object') return item;
  const source = resolveTruthSourceFromItem(item, meta);
  const isSuggested = String(item.contentOrigin || '').toLowerCase() === 'suggested' || source === 'ai_inference' || source === 'template_fallback';
  const hasImage = Boolean(item.imageUrl && String(item.imageUrl).trim());
  const mediaStatus =
    item.mediaStatus ||
    (hasImage ? 'accepted' : item.mediaStatus === 'needs_media' ? 'needs_media' : 'needs_media');

  const confidence =
    typeof item.confidence === 'number'
      ? item.confidence
      : typeof item.businessTruth?.confidence === 'number'
        ? item.businessTruth.confidence
        : isSuggested
          ? 0.35
          : source === 'research' || source === 'ocr' || source === 'website'
            ? 0.85
            : 0.55;

  const reviewStatus =
    item.businessTruth?.reviewStatus ||
    (item.needsOwnerReview || isSuggested ? 'pending' : 'not_required');

  const truth = createBusinessTruth({
    ...(item.businessTruth && typeof item.businessTruth === 'object' ? item.businessTruth : {}),
    source,
    confidence,
    reviewStatus,
    mediaStatus: hasImage && mediaStatus !== 'needs_media' ? 'accepted' : 'needs_media',
    ...(typeof item.mediaMatchScore === 'number' ? { mediaMatchScore: item.mediaMatchScore } : {}),
    status: isSuggested ? 'suggested' : item.needsOwnerReview ? 'needs_confirmation' : undefined,
    requiresConfirmation: Boolean(item.needsOwnerReview) || isSuggested,
  });

  return {
    ...item,
    businessTruth: truth,
    contentOrigin: item.contentOrigin || (isSuggested ? 'suggested' : 'sourced'),
    needsOwnerReview: truth.reviewStatus === 'pending',
    mediaStatus: truth.mediaStatus,
  };
}

/**
 * Hero asset truth from preview.
 * @param {object} preview
 * @returns {BusinessTruth}
 */
export function buildHeroBusinessTruth(preview = {}) {
  const heroUrl =
    (typeof preview.heroImageUrl === 'string' && preview.heroImageUrl.trim()) ||
    (typeof preview.hero?.imageUrl === 'string' && preview.hero.imageUrl.trim()) ||
    '';
  const sourceRaw = String(preview.hero?.source || preview.meta?.heroSource || '').toLowerCase();
  /** @type {TruthSourceType} */
  let source = 'none';
  if (heroUrl) {
    if (sourceRaw === 'upload' || sourceRaw === 'paste') source = 'upload';
    else if (sourceRaw === 'product' || sourceRaw === 'existing') source = 'existing_store';
    else if (sourceRaw === 'mi' || sourceRaw === 'generated') source = 'ai_inference';
    else if (preview.meta?.heroMediaStatus === 'needs_media') source = 'none';
    else source = 'ai_inference';
  }
  const mediaStatus =
    preview.meta?.heroMediaStatus === 'needs_media' || !heroUrl
      ? 'needs_media'
      : preview.hero?.mediaStatus || 'accepted';
  const mediaMatchScore =
    typeof preview.hero?.mediaMatchScore === 'number' ? preview.hero.mediaMatchScore : undefined;

  return createBusinessTruth({
    source,
    confidence: heroUrl && source !== 'ai_inference' ? 0.9 : heroUrl ? 0.45 : 0,
    mediaStatus,
    mediaMatchScore,
    reviewStatus: !heroUrl || source === 'ai_inference' ? 'pending' : 'not_required',
    status: !heroUrl ? 'placeholder' : source === 'ai_inference' ? 'inferred' : 'verified',
    publishEligibility: !heroUrl ? 'allowed_after_approval' : source === 'ai_inference' ? 'allowed_after_approval' : 'eligible',
  });
}

/**
 * Honest presentation labels (Phase 4) — never invent prices/images in UI copy.
 */
export const HonestPresentation = {
  HERO_NEEDED: 'Hero image needed',
  HERO_HINT: 'Upload a hero image or choose from your media library',
  IMAGE_REQUIRED: 'Image required',
  PRICE_ON_REQUEST: 'Price on request',
  LOGO_NEEDED: 'Logo needed',
  CONTACT_MISSING: 'Contact details needed',
};

/**
 * @param {object} item
 * @returns {{ label: string, kind: 'price_on_request'|'priced', value?: number|null, currency?: string|null }}
 */
export function resolveHonestPriceDisplay(item = {}) {
  const explicit =
    item.priceWasNotExplicitlyProvided === false ||
    item.priceOrigin === 'sourced' ||
    item.priceSource === 'sourced' ||
    item.businessTruth?.source === 'research' ||
    item.businessTruth?.source === 'ocr' ||
    item.businessTruth?.source === 'website';
  const raw = item.priceV1?.amount ?? item.price ?? item.amount ?? null;
  const num = raw == null || raw === '' ? null : Number(raw);
  const hasPrice = num != null && Number.isFinite(num) && num > 0;
  if (!hasPrice || item.priceWasNotExplicitlyProvided === true || (!explicit && String(item.contentOrigin || '').toLowerCase() === 'suggested')) {
    return { label: HonestPresentation.PRICE_ON_REQUEST, kind: 'price_on_request', value: null, currency: null };
  }
  const currency = item.priceV1?.currencyCode || item.currencyCode || item.currency || null;
  return { label: String(num), kind: 'priced', value: num, currency };
}

/**
 * @param {object} item
 * @returns {{ status: 'ready'|'needs_media', label: string|null, imageUrl: string|null }}
 */
export function resolveHonestItemImage(item = {}) {
  const url = typeof item.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl.trim() : null;
  if (!url || item.mediaStatus === 'needs_media' || item.businessTruth?.mediaStatus === 'needs_media') {
    return { status: 'needs_media', label: HonestPresentation.IMAGE_REQUIRED, imageUrl: null };
  }
  return { status: 'ready', label: null, imageUrl: url };
}

/**
 * @param {object} preview
 * @returns {{ status: 'ready'|'needs_media', label: string, hint: string, imageUrl: string|null }}
 */
export function resolveHonestHero(preview = {}) {
  const url =
    (typeof preview.heroImageUrl === 'string' && preview.heroImageUrl.trim()) ||
    (typeof preview.hero?.imageUrl === 'string' && preview.hero.imageUrl.trim()) ||
    null;
  if (!url || preview.meta?.heroMediaStatus === 'needs_media' || preview.hero?.mediaStatus === 'needs_media') {
    return {
      status: 'needs_media',
      label: HonestPresentation.HERO_NEEDED,
      hint: HonestPresentation.HERO_HINT,
      imageUrl: null,
    };
  }
  return { status: 'ready', label: '', hint: '', imageUrl: url };
}

/**
 * Build owner-facing review summary counts.
 * @param {object} preview
 */
export function buildOwnerReviewSummary(preview = {}) {
  const items = Array.isArray(preview.items)
    ? preview.items
    : Array.isArray(preview.catalog?.products)
      ? preview.catalog.products
      : [];
  let confirmed = 0;
  let needsReview = 0;
  let suggested = 0;
  let imagesMissing = 0;
  for (const item of items) {
    const origin = String(item?.contentOrigin || '').toLowerCase();
    const truth = item?.businessTruth;
    const review = truth?.reviewStatus || (item?.needsOwnerReview ? 'pending' : 'not_required');
    if (origin === 'suggested' || truth?.status === 'suggested') suggested += 1;
    if (review === 'pending') needsReview += 1;
    else if (review === 'approved' || review === 'not_required') confirmed += 1;
    const honestImg = resolveHonestItemImage(item || {});
    if (honestImg.status === 'needs_media') imagesMissing += 1;
  }
  const hero = resolveHonestHero(preview);
  return {
    totalServices: items.length,
    confirmed,
    needsReview,
    suggested,
    imagesMissing,
    heroRequired: hero.status === 'needs_media',
    lines: [
      items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'} found` : 'No catalogue items yet',
      confirmed ? `${confirmed} confirmed` : null,
      needsReview ? `${needsReview} need${needsReview === 1 ? 's' : ''} review` : null,
      suggested ? `${suggested} AI suggestion${suggested === 1 ? '' : 's'}` : null,
      imagesMissing ? `${imagesMissing} image${imagesMissing === 1 ? '' : 's'} missing` : null,
      hero.status === 'needs_media' ? 'Hero image required' : null,
    ].filter(Boolean),
  };
}

/**
 * @param {AreaReadiness} state
 * @param {string[]} [issues]
 * @param {{ readyCount?: number, totalCount?: number }} [counts]
 * @returns {ContentAreaReadiness}
 */
function area(state, issues = [], counts = {}) {
  return { state, issues, ...counts };
}

/**
 * Compute Content Readiness Model from a draft preview.
 * @param {object} preview
 * @returns {ContentReadinessModel}
 */
export function buildContentReadinessModel(preview = {}) {
  const items = Array.isArray(preview.items) ? preview.items : [];
  const storeName = String(preview.storeName || preview.brand?.name || '').trim();
  const contact = preview.contact && typeof preview.contact === 'object' ? preview.contact : {};
  const hasPhone = Boolean(contact.phone || contact.phoneNumber || preview.phone);
  const hasEmail = Boolean(contact.email || preview.email);
  const hasAddress = Boolean(contact.address || contact.suburb || preview.location || preview.address);
  const logo =
    (typeof preview.avatarUrl === 'string' && preview.avatarUrl.trim()) ||
    (typeof preview.avatar?.imageUrl === 'string' && preview.avatar.imageUrl.trim()) ||
    '';

  const ownerReviewSummary = buildOwnerReviewSummary(preview);
  const hero = resolveHonestHero(preview);

  // Identity
  /** @type {ContentAreaReadiness} */
  let identity;
  if (!storeName) identity = area('blocked', ['Store name missing']);
  else if (!preview.storeType && !preview.businessType) identity = area('needs_review', ['Business type unclear']);
  else identity = area('ready', []);

  // Catalogue
  const sourced = items.filter((i) => String(i?.contentOrigin || '').toLowerCase() === 'sourced');
  const suggested = items.filter((i) => String(i?.contentOrigin || '').toLowerCase() === 'suggested');
  const pending = items.filter(
    (i) => i?.needsOwnerReview || i?.businessTruth?.reviewStatus === 'pending',
  );
  /** @type {ContentAreaReadiness} */
  let catalogue;
  if (preview.meta?.offeringIncomplete?.status === 'needs_input' || items.length === 0) {
    catalogue = area('missing', [preview.meta?.offeringIncomplete?.reason || 'NO_VERIFIED_PRODUCTS_OR_SERVICES'], {
      readyCount: 0,
      totalCount: 0,
    });
  } else if (suggested.length > 0 && sourced.length === 0) {
    catalogue = area('suggested_only', ['Catalogue is suggestion-only — confirm or replace before treating as inventory'], {
      readyCount: 0,
      totalCount: items.length,
    });
  } else if (pending.length > 0) {
    catalogue = area('needs_review', [`${pending.length} item(s) await owner review`], {
      readyCount: items.length - pending.length,
      totalCount: items.length,
    });
  } else {
    catalogue = area('ready', [], { readyCount: items.length, totalCount: items.length });
  }

  // Media
  /** @type {ContentAreaReadiness} */
  let media;
  const mediaIssues = [];
  if (hero.status === 'needs_media') mediaIssues.push('Hero image needed');
  if (ownerReviewSummary.imagesMissing > 0) {
    mediaIssues.push(`${ownerReviewSummary.imagesMissing} product image(s) missing`);
  }
  if (!logo) mediaIssues.push('Logo needed');
  if (mediaIssues.length === 0) media = area('ready', []);
  else if (hero.status === 'needs_media' && !logo) media = area('needs_media', mediaIssues);
  else media = area('needs_media', mediaIssues);

  // Contact
  const contactBits = [hasPhone, hasEmail, hasAddress].filter(Boolean).length;
  /** @type {ContentAreaReadiness} */
  let contactArea;
  if (contactBits === 0) contactArea = area('missing', ['Contact details needed']);
  else if (contactBits < 2) contactArea = area('needs_review', ['Add more contact details']);
  else contactArea = area('ready', []);

  const policies = area(
    preview.meta?.policiesComplete ? 'ready' : 'missing',
    preview.meta?.policiesComplete ? [] : ['Policies not configured'],
  );
  const branding = logo && (preview.brandColors || preview.tagline) ? area('ready', []) : area('needs_review', ['Complete branding']);
  const seo = preview.meta?.seoReady ? area('ready', []) : area('missing', ['SEO not configured']);

  const blocked =
    identity.state === 'blocked' ||
    catalogue.state === 'blocked';
  const needsAttention =
    !blocked &&
    [identity, catalogue, media, contactArea].some((a) =>
      ['needs_review', 'needs_media', 'missing', 'suggested_only'].includes(a.state),
    );

  return {
    identity,
    catalogue,
    media,
    contact: contactArea,
    policies,
    branding,
    seo,
    overall: blocked ? 'blocked' : needsAttention ? 'needs_attention' : 'ready',
    ownerReviewSummary,
    computedAt: new Date().toISOString(),
    heroTruth: buildHeroBusinessTruth(preview),
  };
}

/**
 * Attach readiness + stamped truths onto a catalog build result / preview-shaped object.
 * @param {object} catalogOrPreview
 * @returns {object}
 */
export function applyContentReadinessToCatalog(catalogOrPreview) {
  if (!catalogOrPreview || typeof catalogOrPreview !== 'object') return catalogOrPreview;
  const meta = catalogOrPreview.meta && typeof catalogOrPreview.meta === 'object' ? catalogOrPreview.meta : {};
  const products = Array.isArray(catalogOrPreview.products)
    ? catalogOrPreview.products.map((p) => stampBusinessTruthOnItem(p, meta))
    : Array.isArray(catalogOrPreview.items)
      ? catalogOrPreview.items.map((p) => stampBusinessTruthOnItem(p, meta))
      : null;

  const previewShape = {
    storeName: catalogOrPreview.profile?.name || catalogOrPreview.storeName,
    storeType: catalogOrPreview.profile?.type || catalogOrPreview.storeType,
    items: products || catalogOrPreview.items || [],
    heroImageUrl: catalogOrPreview.heroImageUrl,
    hero: catalogOrPreview.hero,
    contact: catalogOrPreview.contact,
    avatarUrl: catalogOrPreview.avatarUrl,
    meta,
  };
  const contentReadiness = buildContentReadinessModel(previewShape);

  const next = { ...catalogOrPreview };
  if (products && Array.isArray(catalogOrPreview.products)) next.products = products;
  if (products && Array.isArray(catalogOrPreview.items)) next.items = products;
  next.meta = {
    ...meta,
    contentReadiness,
    groundedStoreCreation: meta.groundedStoreCreation ?? true,
  };
  return next;
}

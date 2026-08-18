/**
 * StoreCreationAuthorityTrace — diagnostic metadata only (not a second truth model).
 * Pass 1 stabilization: explain why visible store properties exist.
 */

/** @typedef {'OWNER_CONFIRMED'|'SOURCE_CONFIRMED'|'HIGH_CONFIDENCE_INFERENCE'|'SUGGESTED'|'GENERATED_FALLBACK'} AuthorityLevel */
/** @typedef {'SOURCED'|'INFERRED'|'SUGGESTED'|'GENERATED_FALLBACK'} ProvenanceKind */
/** @typedef {'PASS'|'PASS_WITH_GAPS'|'BLOCKED'} GroundingStatus */

/**
 * @param {Partial<{ value: unknown, source: string|null, provenance: ProvenanceKind|string|null, confidence: number|null, authorityLevel: AuthorityLevel|string|null, fallbackUsed: boolean|string|null }>} partial
 */
export function authorityField(partial = {}) {
  return {
    value: partial.value ?? null,
    source: partial.source ?? null,
    provenance: partial.provenance ?? null,
    confidence: typeof partial.confidence === 'number' ? partial.confidence : null,
    authorityLevel: partial.authorityLevel ?? null,
    fallbackUsed: partial.fallbackUsed ?? false,
  };
}

/**
 * @param {Partial<Record<string, ReturnType<typeof authorityField>>>} fields
 * @param {{ groundingStatus?: GroundingStatus, blockers?: string[], gaps?: string[], notes?: string[] }} [meta]
 */
export function createStoreCreationAuthorityTrace(fields = {}, meta = {}) {
  return {
    version: 1,
    at: new Date().toISOString(),
    fields: { ...fields },
    groundingStatus: meta.groundingStatus || 'PASS_WITH_GAPS',
    blockers: Array.isArray(meta.blockers) ? meta.blockers : [],
    gaps: Array.isArray(meta.gaps) ? meta.gaps : [],
    notes: Array.isArray(meta.notes) ? meta.notes : [],
  };
}

/**
 * Evaluate grounding from catalog + identity signals (bounded Pass 1 gate).
 * @param {{
 *   preview?: object|null,
 *   catalogMeta?: object|null,
 *   products?: object[]|null,
 *   storeType?: string|null,
 *   currencyCode?: string|null,
 *   location?: string|null,
 *   groundedComposition?: object|null,
 * }} input
 */
export function evaluateStoreCreationGrounding(input = {}) {
  const products = Array.isArray(input.products)
    ? input.products
    : Array.isArray(input.preview?.items)
      ? input.preview.items
      : [];
  const blockers = [];
  const gaps = [];

  const storeType = String(input.storeType ?? input.preview?.storeType ?? '').trim();
  const about =
    input.preview?.website?.sections?.find?.((s) => s?.type === 'hero' || s?.type === 'about') ||
    null;
  const heroText = JSON.stringify(input.preview?.website || input.preview?.slogan || '');
  if (/\bquality\s+Other\b/i.test(heroText) || /\bOther you can trust\b/i.test(heroText)) {
    blockers.push('identity_other_leak');
  }
  if (/^other$/i.test(storeType) && input.groundedComposition?.archetype) {
    blockers.push('category_other_overrides_grounded_archetype');
  }

  let inventedAsSourced = 0;
  let needsMedia = 0;
  let sourced = 0;
  for (const p of products) {
    if (!p || typeof p !== 'object') continue;
    const prov = String(p.provenanceStatus || p.provenance || p.origin || '').toUpperCase();
    const isFallback =
      prov.includes('FALLBACK') ||
      prov === 'GENERATED_FALLBACK' ||
      p.origin === 'cuisine_bank' ||
      p.catalogSource === 'cuisine_template';
    const looksSourced = /SOURCED|VERIFIED|EXTRACTED|EVIDENCE/i.test(prov) || p.origin === 'evidence';
    if (isFallback && !p.suggestedOnly) {
      // Unlabelled cuisine/template invent in live catalog is an authority violation.
      inventedAsSourced += 1;
    }
    if (p.mediaStatus === 'needs_media' || (!p.imageUrl && p.mediaRejectReason)) needsMedia += 1;
    if (looksSourced && !isFallback) sourced += 1;
  }
  if (inventedAsSourced > 0) blockers.push('invented_offering_presented_as_sourced');

  const currency =
    input.currencyCode ||
    input.preview?.meta?.currencyCode ||
    input.catalogMeta?.currencyCode ||
    null;
  const loc = String(input.location || input.preview?.location || '').toLowerCase();
  const au = /\b(vic|nsw|qld|australia|fairfield|melbourne)\b/.test(loc);
  if (au && currency && String(currency).toUpperCase() === 'USD') {
    blockers.push('currency_authority_conflict_usd_for_au');
  }

  if (products.length === 0 && input.catalogMeta?.offeringIncomplete) {
    gaps.push('offerings_incomplete');
  }
  if (needsMedia > 0) gaps.push(`needs_media:${needsMedia}`);

  /** @type {GroundingStatus} */
  let groundingStatus = 'PASS';
  if (blockers.length) groundingStatus = 'BLOCKED';
  else if (gaps.length) groundingStatus = 'PASS_WITH_GAPS';

  return { groundingStatus, blockers, gaps, sourcedCount: sourced, inventedAsSourced, needsMedia };
}

/**
 * Build a Pass-1 authority trace for a preview/catalog snapshot.
 * @param {object} ctx
 */
export function buildAuthorityTraceFromPreview(ctx = {}) {
  const preview = ctx.preview && typeof ctx.preview === 'object' ? ctx.preview : {};
  const composition = ctx.groundedComposition || preview.meta?.groundedComposition || null;
  const products = Array.isArray(preview.items) ? preview.items : ctx.products || [];
  const grounding = evaluateStoreCreationGrounding({
    preview,
    products,
    storeType: preview.storeType,
    currencyCode: preview.meta?.currencyCode || ctx.currencyCode,
    location: ctx.location,
    groundedComposition: composition,
    catalogMeta: preview.meta,
  });

  const offeringProvenances = products.map((p) => ({
    name: p?.name ?? null,
    provenance: p?.provenanceStatus || p?.provenance || p?.origin || null,
    authorityLevel: p?.authorityLevel || null,
  }));

  return createStoreCreationAuthorityTrace(
    {
      businessName: authorityField({
        value: preview.storeName || ctx.businessName,
        source: 'preview',
        provenance: 'SOURCED',
        authorityLevel: 'SOURCE_CONFIRMED',
        confidence: 0.9,
      }),
      businessType: authorityField({
        value: preview.storeType,
        source: composition?.archetype ? 'groundedComposition' : 'preview',
        provenance: composition?.archetype ? 'INFERRED' : 'SUGGESTED',
        authorityLevel: composition?.archetype ? 'HIGH_CONFIDENCE_INFERENCE' : 'SUGGESTED',
        confidence: composition?.archetype ? 0.75 : 0.4,
        fallbackUsed: /^other$/i.test(String(preview.storeType || '')),
      }),
      category: authorityField({
        value: preview.storeType,
        source: composition?.archetype ? 'archetype' : 'classifier',
        provenance: 'INFERRED',
        authorityLevel: 'HIGH_CONFIDENCE_INFERENCE',
      }),
      location: authorityField({
        value: ctx.location || preview.location || null,
        source: 'input',
        provenance: 'SOURCED',
        authorityLevel: 'SOURCE_CONFIRMED',
      }),
      currency: authorityField({
        value: preview.meta?.currencyCode || ctx.currencyCode || null,
        source: 'currencyInfer',
        provenance: 'INFERRED',
        authorityLevel: 'HIGH_CONFIDENCE_INFERENCE',
      }),
      offerings: authorityField({
        value: offeringProvenances,
        source: preview.meta?.catalogSource || 'catalog',
        provenance: preview.meta?.catalogSource === 'grounded_evidence' ? 'SOURCED' : preview.meta?.catalogSource,
        authorityLevel:
          preview.meta?.catalogSource === 'cuisine_template' ? 'GENERATED_FALLBACK' : 'SOURCE_CONFIRMED',
        fallbackUsed: preview.meta?.catalogSource === 'cuisine_template',
      }),
      CTA: authorityField({
        value: preview.primaryCTA || preview.ctaLabel,
        source: composition?.primaryCTA ? 'groundedComposition' : 'commerce',
        provenance: 'INFERRED',
        authorityLevel: 'HIGH_CONFIDENCE_INFERENCE',
      }),
      hero: authorityField({
        value: preview.heroImageUrl || preview.hero?.imageUrl || null,
        source: preview.meta?.mediaRejectReason ? 'rejected' : 'finalizeDraft',
        provenance: preview.meta?.mediaMatchScore != null ? 'INFERRED' : 'SUGGESTED',
        confidence: preview.meta?.mediaMatchScore ?? null,
        fallbackUsed: Boolean(preview.meta?.mediaRequiresReview),
      }),
      itemMedia: authorityField({
        value: products.map((p) => ({
          name: p?.name,
          imageUrl: p?.imageUrl ?? null,
          mediaStatus: p?.mediaStatus ?? null,
          mediaMatchScore: p?.mediaMatchScore ?? null,
        })),
        source: 'finalizeDraft',
        provenance: 'INFERRED',
      }),
    },
    grounding,
  );
}

/**
 * Safe display type for customer-facing copy — never interpolate bare "Other".
 * @param {string|null|undefined} storeType
 * @param {string|null|undefined} [archetype]
 */
export function displayBusinessTypeForCopy(storeType, archetype = null) {
  const t = String(storeType || '').trim();
  if (!t || /^other$/i.test(t) || /^unknown$/i.test(t)) {
    const a = String(archetype || '').toUpperCase();
    if (a.includes('FOOD') || a.includes('CAFE') || a.includes('TAKEAWAY')) return 'food business';
    if (a.includes('BEAUTY') || a.includes('APPOINTMENT')) return 'service business';
    if (a.includes('HOME')) return 'home service';
    if (a.includes('RETAIL')) return 'retail business';
    return 'local business';
  }
  return t;
}

export default {
  authorityField,
  createStoreCreationAuthorityTrace,
  evaluateStoreCreationGrounding,
  buildAuthorityTraceFromPreview,
  displayBusinessTypeForCopy,
};

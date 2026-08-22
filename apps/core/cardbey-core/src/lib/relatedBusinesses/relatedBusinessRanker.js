/**
 * Deterministic Related on Cardbey ranking.
 */

import {
  areCategoriesComplementary,
  areCategoriesIncompatible,
  extractCuisineHints,
  normalizeBusinessCategory,
  normalizeBusinessSubcategory,
  resolveStoreTaxonomy,
} from './businessCategoryTaxonomy.js';

/**
 * @typedef {object} RelatedCandidateInput
 * @property {string} id
 * @property {string} [slug]
 * @property {string} [name]
 * @property {string} [type]
 * @property {string} [businessType]
 * @property {string} [description]
 * @property {string} [suburb]
 * @property {string} [city]
 * @property {string} [location]
 * @property {boolean} [isActive]
 * @property {unknown} [publishedAt]
 * @property {boolean} [hasPublicStorefront]
 * @property {string} [href]
 * @property {string} [imageUrl]
 * @property {string} [category] legacy feed lane
 */

/**
 * @param {RelatedCandidateInput} candidate
 * @param {{ id?: string, slug?: string }} source
 */
export function isCandidateEligible(candidate, source) {
  const reasons = [];
  const id = String(candidate.id ?? '').trim();
  const slug = String(candidate.slug ?? '').trim().toLowerCase();
  const sourceId = String(source.id ?? '').trim();
  const sourceSlug = String(source.slug ?? '').trim().toLowerCase();

  if (!id && !slug) {
    return { eligible: false, reasons: ['missing_identity'] };
  }
  if ((sourceId && id && id === sourceId) || (sourceSlug && slug && slug === sourceSlug)) {
    return { eligible: false, reasons: ['same_business'] };
  }
  if (candidate.isActive === false) {
    return { eligible: false, reasons: ['inactive'] };
  }
  if (candidate.publishedAt === null || candidate.publishedAt === false) {
    // only enforce when field explicitly present as null/false
    if ('publishedAt' in candidate && !candidate.publishedAt) {
      return { eligible: false, reasons: ['unpublished'] };
    }
  }
  if (candidate.hasPublicStorefront === false) {
    return { eligible: false, reasons: ['no_public_storefront'] };
  }
  return { eligible: true, reasons };
}

/**
 * @param {ReturnType<typeof resolveStoreTaxonomy>} sourceTax
 * @param {RelatedCandidateInput} candidate
 */
export function scoreRelatedCandidate(sourceTax, candidate) {
  const candTax = resolveStoreTaxonomy(candidate);
  const reasons = [];
  let score = 0;

  if (candTax.category === sourceTax.category) {
    score += 100;
    reasons.push('same_category');
  } else if (areCategoriesIncompatible(sourceTax.category, candTax.category)) {
    score -= 100;
    reasons.push('incompatible_category');
  } else if (areCategoriesComplementary(sourceTax.category, candTax.category)) {
    score += 10;
    reasons.push('complementary_category');
  } else if (candTax.category === 'OTHER' || !candidate.type) {
    score -= 20;
    reasons.push('missing_or_other_category');
  }

  if (
    sourceTax.subcategory &&
    candTax.subcategory &&
    sourceTax.subcategory === candTax.subcategory
  ) {
    score += 50;
    reasons.push('same_subcategory');
  }

  const sharedCuisine = sourceTax.cuisine.filter((c) => candTax.cuisine.includes(c));
  if (sharedCuisine.length > 0) {
    score += 30;
    reasons.push('same_cuisine');
  } else {
    // also probe candidate name against source cuisine
    const fromName = extractCuisineHints(candidate.name, candidate.description).filter((c) =>
      sourceTax.cuisine.includes(c),
    );
    if (fromName.length > 0) {
      score += 30;
      reasons.push('same_cuisine');
    }
  }

  const srcSuburb = String(sourceTax.location.suburb ?? '').toLowerCase();
  const srcCity = String(sourceTax.location.city ?? '').toLowerCase();
  const candSuburb = String(candTax.location.suburb ?? '').toLowerCase();
  const candCity = String(candTax.location.city ?? '').toLowerCase();
  if ((srcSuburb && candSuburb && srcSuburb === candSuburb) || (srcCity && candCity && srcCity === candCity)) {
    score += 20;
    reasons.push('same_location');
  }

  return {
    candidateId: String(candidate.id || candidate.slug || ''),
    score,
    reasons,
    taxonomy: candTax,
  };
}

/**
 * @param {RelatedCandidateInput} source
 * @param {RelatedCandidateInput[]} candidates
 * @param {{ limit?: number, diagnostics?: boolean }} [options]
 */
export function rankRelatedCandidates(source, candidates, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 8, 24));
  const sourceTax = resolveStoreTaxonomy(source);
  const sourceRef = { id: source.id, slug: source.slug };

  /** @type {Array<{ candidate: RelatedCandidateInput, ranking: ReturnType<typeof scoreRelatedCandidate> }>} */
  const scored = [];
  const seen = new Set();

  for (const raw of candidates) {
    const elig = isCandidateEligible(raw, sourceRef);
    if (!elig.eligible) continue;
    const key = String(raw.slug || raw.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const ranking = scoreRelatedCandidate(sourceTax, raw);
    scored.push({ candidate: raw, ranking });
  }

  scored.sort((a, b) => {
    if (b.ranking.score !== a.ranking.score) return b.ranking.score - a.ranking.score;
    return String(a.candidate.slug || a.candidate.id).localeCompare(
      String(b.candidate.slug || b.candidate.id),
    );
  });

  const sameCategory = scored.filter((x) => x.ranking.reasons.includes('same_category'));
  const complementary = scored.filter(
    (x) =>
      !x.ranking.reasons.includes('same_category') &&
      x.ranking.reasons.includes('complementary_category') &&
      !x.ranking.reasons.includes('incompatible_category'),
  );
  const incompatible = scored.filter((x) => x.ranking.reasons.includes('incompatible_category'));

  /** @type {typeof scored} */
  let relatedPool = [];
  /** @type {'same_category'|'complementary'|'general'|'none'} */
  let fallbackLevel = 'none';

  // Prefer fewer same-category cards over padding with incompatible verticals.
  if (sameCategory.length > 0) {
    relatedPool = sameCategory;
    fallbackLevel = 'same_category';
  } else if (complementary.length > 0) {
    relatedPool = complementary;
    fallbackLevel = 'complementary';
  } else {
    relatedPool = [];
    fallbackLevel = 'none';
  }

  const related = relatedPool.slice(0, limit).map((x) => ({
    ...x.candidate,
    _relatedScore: x.ranking.score,
    _relatedReasons: x.ranking.reasons,
  }));

  // General discovery is separate — never mixed into Related while we have a policy of fewer cards.
  const generalFallback =
    related.length === 0
      ? incompatible
          .concat(scored.filter((x) => !sameCategory.includes(x) && !complementary.includes(x)))
          .filter((x, i, arr) => arr.indexOf(x) === i)
          .slice(0, limit)
          .map((x) => ({
            ...x.candidate,
            _relatedScore: x.ranking.score,
            _relatedReasons: [...x.ranking.reasons, 'general_fallback'],
          }))
      : [];

  if (related.length === 0 && generalFallback.length > 0) {
    fallbackLevel = 'general';
  }

  return {
    related,
    generalFallback,
    context: {
      sourceStoreId: String(source.id || ''),
      sourceSlug: String(source.slug || ''),
      category: sourceTax.category,
      subcategory: sourceTax.subcategory,
      location: sourceTax.location,
      cuisine: sourceTax.cuisine,
      fallbackLevel,
      taxonomyVersion: undefined,
    },
    diagnostics: options.diagnostics
      ? scored.slice(0, 40).map((x) => ({
          candidateId: x.ranking.candidateId,
          score: x.ranking.score,
          reasons: x.ranking.reasons,
          category: x.ranking.taxonomy.category,
          slug: x.candidate.slug,
        }))
      : undefined,
  };
}

export {
  normalizeBusinessCategory,
  normalizeBusinessSubcategory,
  resolveStoreTaxonomy,
};

/**
 * Grounded Store Creation V1 — stop silent product invention and weak media fill.
 * Gated by ENABLE_GROUNDED_STORE_CREATION_V1 (Features.groundedStoreCreation.v1).
 *
 * Rule: a smaller but accurate store beats a complete-looking invented one.
 */

import { Features } from '../../config/features.js';
import { applyContentReadinessToCatalog } from './contentReadinessModel.js';

export const NO_VERIFIED_PRODUCTS_OR_SERVICES = 'NO_VERIFIED_PRODUCTS_OR_SERVICES';

/** Exact generic scaffold names commonly invented by AI expansion / seeds / templates. */
export const INVENTED_GENERIC_PRODUCT_NAMES = new Set(
  [
    'consultation',
    'custom quote',
    'express service',
    'package deal',
    'gift voucher',
    'loyalty discount',
    'standard service',
    'premium service',
    'starter package',
    'business package',
    'call-out fee',
    'call out fee',
    'loyalty points',
    'gift card',
    'gift wrapping',
  ].map((s) => s.toLowerCase()),
);

const INVENTED_GENERIC_PRODUCT_RE =
  /^(consultation|custom quote|express service|package deal|gift voucher|loyalty discount|standard service|premium service|starter package|business package|call-?out fee|loyalty points|gift card|gift wrapping|service\s*\d+|package\s*[a-z]|featured item|popular choice|special deal)$/i;

/**
 * @returns {boolean}
 */
export function isGroundedStoreCreationEnabled() {
  return Features.groundedStoreCreation.v1 === true;
}

/**
 * @returns {number}
 */
export function getMinMediaMatchScore() {
  const n = Features.groundedStoreCreation.minMediaMatchScore;
  if (!Number.isFinite(n)) return 0.55;
  return Math.max(0.2, Math.min(0.95, n));
}

/**
 * @param {string | null | undefined} name
 */
export function normalizeProductNameKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * @param {string | null | undefined} name
 */
export function isInventedGenericProductName(name) {
  const key = normalizeProductNameKey(name);
  if (!key) return false;
  if (INVENTED_GENERIC_PRODUCT_NAMES.has(key)) return true;
  return INVENTED_GENERIC_PRODUCT_RE.test(key);
}

/**
 * Structured incomplete offering — never invent inventory to fill the gap.
 * @param {{ reason?: string, suggestedQuestions?: string[] }} [opts]
 */
export function buildOfferingIncompleteState(opts = {}) {
  return {
    status: 'needs_input',
    reason: opts.reason || NO_VERIFIED_PRODUCTS_OR_SERVICES,
    suggestedQuestions: Array.isArray(opts.suggestedQuestions)
      ? opts.suggestedQuestions
      : [
          'What products or services would you like to offer?',
          'Would you like Cardbey to draft suggestions for your review?',
        ],
  };
}

/**
 * @param {object[]} products
 * @returns {{ products: object[], strippedCount: number, strippedNames: string[] }}
 */
export function stripInventedGenericProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return { products: [], strippedCount: 0, strippedNames: [] };
  }
  const kept = [];
  const strippedNames = [];
  for (const p of products) {
    if (isInventedGenericProductName(p?.name)) {
      strippedNames.push(String(p?.name ?? ''));
      continue;
    }
    kept.push(p);
  }
  return { products: kept, strippedCount: strippedNames.length, strippedNames };
}

/**
 * Token overlap helper for semantic media matching.
 * @param {string} text
 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Score whether a candidate image belongs with this business/item.
 * Combines provider confidence with business-type / item / query overlap.
 *
 * @param {{
 *   itemName?: string|null,
 *   businessType?: string|null,
 *   verticalSlug?: string|null,
 *   storeName?: string|null,
 *   altText?: string|null,
 *   caption?: string|null,
 *   filename?: string|null,
 *   query?: string|null,
 *   providerConfidence?: number|null,
 *   source?: string|null,
 * }} input
 * @returns {number} 0–1
 */
export function scoreSemanticMediaMatch(input = {}) {
  const provider =
    typeof input.providerConfidence === 'number' && Number.isFinite(input.providerConfidence)
      ? Math.max(0, Math.min(1, input.providerConfidence))
      : 0.35;

  const corpus = [input.altText, input.caption, input.filename, input.query]
    .map((s) => String(s ?? '').toLowerCase())
    .join(' ');

  const contextTokens = [
    ...tokenize(input.itemName),
    ...tokenize(input.businessType),
    ...tokenize(String(input.verticalSlug || '').replace(/[._]/g, ' ')),
    ...tokenize(input.storeName),
  ];
  const uniqueCtx = [...new Set(contextTokens)];
  let overlap = 0;
  for (const t of uniqueCtx) {
    if (corpus.includes(t)) overlap += 1;
  }
  const overlapScore =
    uniqueCtx.length === 0 ? 0 : Math.min(0.45, (overlap / Math.max(uniqueCtx.length, 1)) * 0.55);

  let score = provider * 0.55 + overlapScore;

  // Verified business / scrape sources get a small boost; pure stock stays strict.
  const source = String(input.source || '').toLowerCase();
  if (source === 'web_scrape' || source === 'upload' || source === 'owner' || source === 'imported') {
    score += 0.15;
  } else if (source === 'pexels' || source === 'unsplash' || source === 'seed_library' || source === 'openai') {
    score -= 0.05;
  }

  // Hard mismatch cues (food imagery for signage-like context, etc.)
  const biz = String(input.businessType || input.verticalSlug || '').toLowerCase();
  const isSignageLike = /\bsign(age)?|print|banner|vinyl|wayfind/.test(biz);
  const foodLeak = /\b(pastry|donut|croissant|latte|burger|sushi|pizza|cafe)\b/.test(corpus);
  if (isSignageLike && foodLeak) score -= 0.4;

  // Florist / flower retail must not accept aviation, dental, generic office stock.
  const isFlorist =
    /\bflorist|flower|floral|bouquet|retail\.flower\b/.test(biz) ||
    /\bflorist|flower|floral|bouquet\b/.test(String(input.storeName || '').toLowerCase());
  if (isFlorist) {
    const bad =
      /\b(aircraft|airplane|aviation|flying service|dental|dentist|teeth|office hallway|emergency exit|security camera|call-?out|inspection|shopping\s*cart|car\s*interior|sedan|automobile)\b/.test(
        corpus,
      );
    if (bad) score -= 0.7;
    // Prefer exact offering / bouquet / shop context over generic flowers keyword co-occurrence
    if (/\b(bouquet|arrangement|florist\s*shop|flower\s*shop|hat\s*box|orchid|roses?\b)/.test(corpus)) {
      score += 0.2;
    } else if (/\b(flower|floral|rose|plant|bloom|florist|garden)\b/.test(corpus)) {
      score += 0.1;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * @param {number} score
 * @param {number} [minScore]
 */
export function shouldAcceptMediaMatch(score, minScore = getMinMediaMatchScore()) {
  return Number.isFinite(score) && score >= minScore;
}

/**
 * @param {object} item
 * @param {string} [reason]
 */
export function markItemNeedsMedia(item, reason = 'weak_media_match') {
  if (!item || typeof item !== 'object') return item;
  item.imageUrl = null;
  item.mediaStatus = 'needs_media';
  item.mediaRejectReason = reason;
  return item;
}

/**
 * @param {Partial<{
 *   requestId: string|null,
 *   acquisitionSources: string[],
 *   extractedFactCount: number,
 *   verifiedFactCount: number,
 *   inferredFactCount: number,
 *   rejectedFactCount: number,
 *   generatedSuggestionCount: number,
 *   mediaCandidates: number,
 *   acceptedMedia: number,
 *   rejectedMedia: number,
 *   readinessResult: object|null,
 *   projectionMode: string|null,
 *   fallbackUsage: object,
 *   validationFailures: string[],
 *   strippedInventedProducts: string[],
 *   offeringIncomplete: object|null,
 * }>} partial
 */
export function createGroundedCreationDiagnostics(partial = {}) {
  return {
    requestId: partial.requestId ?? null,
    acquisitionSources: Array.isArray(partial.acquisitionSources) ? partial.acquisitionSources : [],
    extractedFactCount: partial.extractedFactCount ?? 0,
    verifiedFactCount: partial.verifiedFactCount ?? 0,
    inferredFactCount: partial.inferredFactCount ?? 0,
    rejectedFactCount: partial.rejectedFactCount ?? 0,
    generatedSuggestionCount: partial.generatedSuggestionCount ?? 0,
    mediaCandidates: partial.mediaCandidates ?? 0,
    acceptedMedia: partial.acceptedMedia ?? 0,
    rejectedMedia: partial.rejectedMedia ?? 0,
    readinessResult: partial.readinessResult ?? null,
    projectionMode: partial.projectionMode ?? null,
    fallbackUsage: partial.fallbackUsage ?? {},
    validationFailures: Array.isArray(partial.validationFailures) ? partial.validationFailures : [],
    strippedInventedProducts: Array.isArray(partial.strippedInventedProducts)
      ? partial.strippedInventedProducts
      : [],
    offeringIncomplete: partial.offeringIncomplete ?? null,
    flag: 'ENABLE_GROUNDED_STORE_CREATION_V1',
    at: new Date().toISOString(),
  };
}

/**
 * @param {object} diagnostics
 */
export function logGroundedDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return;
  // Always log when grounded path runs — ops need to answer "why did this product appear?"
  console.log('[groundedStoreCreation] diagnostics', diagnostics);
}

/**
 * Apply invent-stop policy to a CatalogBuildResult.
 * Strips invented generics; if nothing remains, attach incomplete offering meta.
 *
 * @param {object} result
 * @param {{ draftId?: string, mode?: string, catalogSource?: string }} [ctx]
 * @returns {{ result: object, diagnostics: object }}
 */
export function applyGroundedCatalogPolicy(result, ctx = {}) {
  if (!result || typeof result !== 'object') {
    const offeringIncomplete = buildOfferingIncompleteState();
    const diagnostics = createGroundedCreationDiagnostics({
      requestId: ctx.draftId ?? null,
      acquisitionSources: [ctx.mode || 'unknown'],
      rejectedFactCount: 0,
      offeringIncomplete,
      fallbackUsage: { inventStop: true },
    });
    return {
      result: {
        profile: {},
        categories: [],
        products: [],
        meta: {
          catalogSource: 'none',
          groundedStoreCreation: true,
          offeringIncomplete,
          groundedDiagnostics: diagnostics,
        },
      },
      diagnostics,
    };
  }

  const before = Array.isArray(result.products) ? result.products : [];
  const { products, strippedCount, strippedNames } = stripInventedGenericProducts(before);
  const offeringIncomplete =
    products.length === 0 ? buildOfferingIncompleteState() : null;

  const diagnostics = createGroundedCreationDiagnostics({
    requestId: ctx.draftId ?? null,
    acquisitionSources: [ctx.catalogSource || ctx.mode || result?.meta?.catalogSource || 'unknown'],
    extractedFactCount: before.length,
    verifiedFactCount: products.length,
    rejectedFactCount: strippedCount,
    strippedInventedProducts: strippedNames,
    offeringIncomplete,
    fallbackUsage: {
      inventStop: true,
      skippedAiExpansion: Boolean(ctx.skippedAiExpansion),
      skippedSeedPad: Boolean(ctx.skippedSeedPad),
      skippedAiTemplateFallback: Boolean(ctx.skippedAiTemplateFallback),
      skippedLeakRepairInvent: Boolean(ctx.skippedLeakRepairInvent),
    },
  });

  let next = {
    ...result,
    products,
    meta: {
      ...(result.meta ?? {}),
      groundedStoreCreation: true,
      ...(offeringIncomplete ? { offeringIncomplete } : {}),
      groundedDiagnostics: diagnostics,
      ...(strippedCount > 0
        ? { strippedInventedProductCount: strippedCount, strippedInventedProductNames: strippedNames }
        : {}),
    },
  };

  // Empty offering: keep identity categories empty rather than inventing "Other" commerce.
  if (offeringIncomplete && (!Array.isArray(next.categories) || next.categories.length === 0)) {
    next.categories = [];
  }

  // Phase 3: stamp Business Truth + Content Readiness on every remaining asset.
  next = applyContentReadinessToCatalog(next);

  logGroundedDiagnostics(diagnostics);
  return { result: next, diagnostics };
}

/**
 * Minimal empty catalog used when AI fails under grounded mode (no template invent).
 * @param {object} params
 */
export function buildGroundedEmptyCatalogResult(params = {}) {
  const offeringIncomplete = buildOfferingIncompleteState();
  const diagnostics = createGroundedCreationDiagnostics({
    requestId: params.draftId ?? null,
    acquisitionSources: ['ai_failed'],
    offeringIncomplete,
    fallbackUsage: { skippedAiTemplateFallback: true },
    validationFailures: ['ai_catalog_failed_no_template_fallback'],
  });
  return {
    profile: {
      name: params.businessName || 'Store',
      type: params.businessType || params.storeType || 'general',
      tagline: null,
      heroText: null,
      primaryColor: null,
      secondaryColor: null,
      stylePreferences: null,
    },
    categories: [],
    products: [],
    meta: {
      catalogSource: 'none',
      groundedStoreCreation: true,
      aiFailed: true,
      aiFallback: false,
      offeringIncomplete,
      groundedDiagnostics: diagnostics,
      aiFallbackReason:
        typeof params.aiErrorMessage === 'string' ? params.aiErrorMessage.slice(0, 240) : 'ai_catalog_failed',
    },
  };
}

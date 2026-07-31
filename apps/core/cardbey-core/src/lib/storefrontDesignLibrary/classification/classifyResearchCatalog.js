/**
 * Attach semantic classification to research catalog products (additive).
 */

import { isDesignLibraryV1Enabled, isDesignLibraryAuthoritative } from '../flags.js';
import { classifyBusinessContent } from './businessContentClassifier.js';
import {
  classificationToRowFields,
  summarizeClassifications,
  CLASSIFIER_VERSION,
} from './classificationResult.js';

/**
 * @param {unknown[]} products
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean }} [opts]
 */
export function classifyResearchCatalogProducts(products, context = {}, opts = {}) {
  if (!opts.force && !isDesignLibraryV1Enabled()) {
    return {
      products: Array.isArray(products) ? products : [],
      summary: null,
      attached: false,
    };
  }
  // Phase 2 never becomes authoritative for rendering.
  void isDesignLibraryAuthoritative();

  const list = Array.isArray(products) ? products : [];
  /** @type {import('./classificationResult.js').BusinessContentClassification[]} */
  const results = [];
  const next = list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const classification = classifyBusinessContent(item, context);
    results.push(classification);
    const fields = classificationToRowFields(classification);
    return {
      ...item,
      ...fields,
      // Never overwrite provenance
      contentOrigin: item.contentOrigin,
      needsOwnerReview: item.needsOwnerReview,
      catalogSource: item.catalogSource,
    };
  });

  const summary = summarizeClassifications(results);
  return { products: next, summary, attached: true };
}

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean, emit?: boolean, missionId?: string|null, draftStoreId?: string|null }} [opts]
 */
export function classifyResearchCatalog(catalog, context = {}, opts = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog, summary: null, attached: false };
  }
  const { products, summary, attached } = classifyResearchCatalogProducts(
    catalog.products,
    context,
    opts,
  );
  if (!attached || !summary) {
    return { catalog, summary: null, attached: false };
  }

  const next = {
    ...catalog,
    products,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      contentClassification: {
        classifierVersion: CLASSIFIER_VERSION,
        ...summary,
      },
    },
  };

  if (opts.emit !== false) {
    emitClassificationCompleted({
      missionId: opts.missionId ?? null,
      draftStoreId: opts.draftStoreId ?? null,
      summary,
    });
  }

  return { catalog: next, summary, attached: true };
}

/**
 * @param {{ missionId?: string|null, draftStoreId?: string|null, summary: ReturnType<typeof summarizeClassifications> }} payload
 */
export function emitClassificationCompleted(payload) {
  const summary = payload.summary;
  const event = {
    event: 'storefront.classification.completed',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    classifierVersion: summary.classifierVersion,
    totalItems: summary.totalItems,
    counts: summary.counts,
    lowConfidenceCount: summary.lowConfidenceCount,
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_CLASSIFICATION_LOG === '1') {
    try {
      console.info('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}

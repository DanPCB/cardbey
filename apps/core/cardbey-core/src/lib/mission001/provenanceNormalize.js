/**
 * Mission 001 Gate 4 — normalize provenance on catalog products.
 */

export const PROVENANCE_STATUS = Object.freeze({
  REAL: 'REAL',
  INFERRED: 'INFERRED',
  GENERATED: 'GENERATED',
  UNKNOWN: 'UNKNOWN',
});

const REAL_SOURCES = new Set([
  'owner_provided',
  'official_source',
  'verified_external',
  'owner',
  'ocr',
  'website',
  'official_website',
  'uploaded_document',
  'manual',
  'sourced',
]);

const INFERRED_SOURCES = new Set([
  'inferred_from_evidence',
  'inferred',
  'directory',
  'google_business',
]);

/**
 * @param {object} item
 * @param {{ catalogSource?: string, contentOrigin?: string }} [meta]
 */
export function inferProvenanceStatus(item, meta = {}) {
  const origin = String(
    item?.contentOrigin ?? meta?.contentOrigin ?? item?.provenance?.source ?? item?.evidenceStatus ?? '',
  ).toLowerCase();
  const sourceType = String(item?.sourceType ?? item?.researchMeta?.sourceType ?? '').toLowerCase();
  const conf = Number(item?.confidence ?? item?.provenance?.confidence ?? item?.researchMeta?.confidence);

  if (item?.aiGenerated === true || origin.includes('ai_generated') || origin.includes('category_fallback')) {
    return PROVENANCE_STATUS.GENERATED;
  }
  if (
    REAL_SOURCES.has(origin) ||
    REAL_SOURCES.has(sourceType) ||
    meta?.catalogSource === 'research' ||
    meta?.catalogSource === 'source_grounded' ||
    item?.priceProvenance === 'owner' ||
    item?.priceProvenance === 'ocr'
  ) {
    return conf > 0 && conf < 0.55 ? PROVENANCE_STATUS.INFERRED : PROVENANCE_STATUS.REAL;
  }
  if (INFERRED_SOURCES.has(origin) || INFERRED_SOURCES.has(sourceType) || (conf >= 0.55 && conf < 0.82)) {
    return PROVENANCE_STATUS.INFERRED;
  }
  if (!item?.name) return PROVENANCE_STATUS.UNKNOWN;
  if (meta?.catalogSource === 'template' || meta?.catalogSource === 'ai') return PROVENANCE_STATUS.GENERATED;
  return PROVENANCE_STATUS.UNKNOWN;
}

/**
 * @param {object} catalog
 */
export function attachNormalizedProvenanceToCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') return catalog;
  const meta = catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {};
  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const nextProducts = products.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const status = inferProvenanceStatus(p, meta);
    return {
      ...p,
      provenanceStatus: status,
      provenance:
        p.provenance && typeof p.provenance === 'object'
          ? { ...p.provenance, status }
          : {
              status,
              source: p.sourceType ?? meta.catalogSource ?? 'unknown',
              confidence: Number(p.confidence) || null,
            },
    };
  });
  return { ...catalog, products: nextProducts };
}

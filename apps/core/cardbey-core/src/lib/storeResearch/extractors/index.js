/**
 * Phase 3 — Provider-specific extractors behind one interface.
 */

import { extractFromWebsite } from '../../businessDiscovery/businessDiscoverySources.js';
import { extractBusinessFacts } from '../../storeCreationResearch/businessFactsExtractor.js';
import { extractServiceMenuCatalog } from '../../storeCreationResearch/serviceMenuExtractor.js';
import { extractMenuLinesFromHtml, extractOffersFromSchemaBlocks } from '../../storeCreationResearch/websiteMenuHtmlExtract.js';
import { scoreSourceMatch } from '../../storeCreationResearch/sourceConfidenceScorer.js';

/**
 * @typedef {import('./types.js').DiscoveredSource} DiscoveredSource
 * @typedef {import('../storeCreationResearch/types.js').StoreCreationResearchInput} StoreCreationResearchInput
 */

/**
 * @typedef {Object} BusinessSourceExtractor
 * @property {string} id
 * @property {(source: DiscoveredSource) => boolean} supports
 * @property {(source: DiscoveredSource, ctx: { input: StoreCreationResearchInput, legacySources?: object[] }) => Promise<object|null>} extract
 */

/** @type {BusinessSourceExtractor} */
export const GooglePlacesExtractor = {
  id: 'google_places',
  supports: (source) => source.type === 'google_business',
  async extract(source, ctx) {
    const legacy = ctx.legacySources?.find((s) => s?.source?.sourceType === 'google_business');
    if (!legacy) return null;
    const match = scoreSourceMatch(legacy.source, ctx.input);
    if (!match.matched) return null;
    return { match, facts: extractBusinessFacts([match], ctx.input) };
  },
};

/** @type {BusinessSourceExtractor} */
export const OfficialWebsiteExtractor = {
  id: 'official_website',
  supports: (source) => source.type === 'official_website' && Boolean(source.url),
  async extract(source) {
    if (!source.url) return null;
    const blocks = await extractFromWebsite(source.url);
    return { blocks, sourceUrl: source.url };
  },
};

/** @type {BusinessSourceExtractor} */
export const SchemaOrgExtractor = {
  id: 'schema_org',
  supports: (source) =>
    source.type === 'official_website' ||
    Boolean(source.raw?.schemaOrg || source.raw?.jsonLd),
  async extract(source) {
    const schema = source.raw?.schemaOrg ?? source.raw?.jsonLd;
    if (!schema) return null;
    const offers = extractOffersFromSchemaBlocks(Array.isArray(schema) ? schema : [schema]);
    return { offers, sourceUrl: source.url ?? null };
  },
};

/** @type {BusinessSourceExtractor} */
export const MenuPageExtractor = {
  id: 'menu_page',
  supports: (source) => source.type === 'official_website' && Boolean(source.raw?.html),
  async extract(source) {
    const html = String(source.raw?.html ?? '');
    if (!html.trim()) return null;
    const lines = extractMenuLinesFromHtml(html);
    return { menuLines: lines, sourceUrl: source.url ?? null };
  },
};

/** @type {BusinessSourceExtractor} */
export const ServicePageExtractor = {
  id: 'service_page',
  supports: (source) => source.type === 'official_website' || source.type === 'booking_platform',
  async extract(source, ctx) {
    const legacyMatches = (ctx.legacySources ?? []).filter((m) => m?.matched);
    if (!legacyMatches.length) return null;
    const facts = extractBusinessFacts(legacyMatches, ctx.input);
    const { items, businessKind } = extractServiceMenuCatalog(facts, legacyMatches, ctx.input);
    return { facts, items, businessKind };
  },
};

/** @type {BusinessSourceExtractor} */
export const ProductPageExtractor = {
  id: 'product_page',
  supports: (source) => source.type === 'official_website',
  async extract(source, ctx) {
    return ServicePageExtractor.extract(source, ctx);
  },
};

/** @type {BusinessSourceExtractor} */
export const PdfMenuExtractor = {
  id: 'pdf_menu',
  supports: (source) => source.type === 'uploaded_document' || /\.pdf(\?|$)/i.test(String(source.url ?? '')),
  async extract(source, ctx) {
    const ocr = ctx.input?.ocrText;
    if (!ocr) return null;
    const lines = ocr.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    return { menuLines: lines, sourceUrl: source.url ?? null, via: 'ocr' };
  },
};

/** @type {BusinessSourceExtractor} */
export const ABRExtractor = {
  id: 'abn_register',
  supports: () => false,
  async extract() {
    /** ABR API integration planned — government_business_register provider stub */
    return null;
  },
};

/** @type {BusinessSourceExtractor[]} */
export const BUSINESS_SOURCE_EXTRACTORS = [
  GooglePlacesExtractor,
  OfficialWebsiteExtractor,
  SchemaOrgExtractor,
  MenuPageExtractor,
  ServicePageExtractor,
  ProductPageExtractor,
  PdfMenuExtractor,
  ABRExtractor,
];

/**
 * Run all supporting extractors for discovered sources.
 * @param {DiscoveredSource[]} sources
 * @param {StoreCreationResearchInput} input
 * @param {object[]} [legacyScoredSources]
 */
export async function runBusinessSourceExtractors(sources, input, legacyScoredSources = []) {
  const ctx = { input, legacySources: legacyScoredSources };
  /** @type {Record<string, object>} */
  const out = {};
  for (const source of sources) {
    for (const extractor of BUSINESS_SOURCE_EXTRACTORS) {
      if (!extractor.supports(source)) continue;
      try {
        const payload = await extractor.extract(source, ctx);
        if (payload) out[extractor.id] = { sourceId: source.id, ...payload };
      } catch (err) {
        out[extractor.id] = { sourceId: source.id, error: err?.message ?? String(err) };
      }
    }
  }
  return out;
}

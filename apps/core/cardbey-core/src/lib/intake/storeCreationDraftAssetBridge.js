/**
 * Asset → StoreCreationDraft bridge (OCR, business card, flyer, QR URL, website).
 */

import { parseBusinessCardOCR } from '../businessCardParser.js';
import { inferStoreCategoryFromHint, formatStoreCreationDraftResponse } from './storeCreationDraft.js';
import { fetchHtml, extractMetaContent, extractTitle, extractJsonLd } from '../social-import/scrapeUtils.js';

const URL_RE = /https?:\/\/[^\s\]\)"'<>]+/i;
const WWW_RE = /(?:^|[\s(])www\.[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9](?:\/[^\s\]\)"'<>]*)?/i;

/** @typedef {'business_card'|'storefront_photo'|'flyer'|'brochure'|'menu'|'website'|'qr'|'ocr'|'unknown'} AssetDraftSource */

const VERTICAL_SLUG_TO_CATEGORY = {
  food_beverage: 'Food & drink',
  beauty: 'Beauty',
  home_garden: 'Home & garden',
  automotive: 'Automotive',
  furniture: 'Home & garden',
  sports: 'Sports',
  health: 'Health',
  arts_crafts: 'Arts & crafts',
  signage: 'Signage',
  construction: 'Construction',
  fashion: 'Fashion',
  technology: 'Technology',
};

export const STORE_DRAFT_DIRECT_ASSET_TYPES = new Set(['business_card', 'storefront_photo']);

function stripQuotes(value) {
  return String(value ?? '')
    .replace(/^[\s"'`\u201c\u201d\u2018\u2019]+|[\s"'`\u201c\u201d\u2018\u2019]+$/g, '')
    .trim();
}

function asTrimmed(value) {
  const s = stripQuotes(value);
  return s || null;
}

/**
 * @param {string | null | undefined} slug
 */
export function mapVerticalSlugToCategory(slug) {
  const key = String(slug ?? '').trim().toLowerCase();
  if (!key) return null;
  return VERTICAL_SLUG_TO_CATEGORY[key] ?? null;
}

/**
 * @param {string} raw
 */
export function extractFirstUrlFromText(raw) {
  const text = String(raw ?? '');
  const https = text.match(URL_RE)?.[0];
  if (https) return https.replace(/[.,;]+$/, '');
  const www = text.match(WWW_RE)?.[0];
  if (www) {
    const cleaned = www.trim().replace(/^\s*\(/, '');
    return cleaned.startsWith('http') ? cleaned.replace(/[.,;]+$/, '') : `https://${cleaned.replace(/^\s*www\.?/i, 'www.')}`;
  }
  return null;
}

function domainToDisplayName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const base = host.split('.')[0] ?? host;
    return base
      .split(/[-_]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return null;
  }
}

/**
 * @param {string} extractedText
 */
export function buildOcrHintsFromImageText(extractedText) {
  const text = String(extractedText ?? '').trim();
  if (!text) return null;
  const { extractedEntities } = parseBusinessCardOCR(text, { country: 'AU' });
  const entities =
    extractedEntities && typeof extractedEntities === 'object' ? extractedEntities : {};
  const phones = Array.isArray(entities.phones) ? entities.phones : [];
  const location =
    asTrimmed(entities.address) ||
    asTrimmed(entities.suburb) ||
    asTrimmed(entities.city) ||
    null;
  const vertical =
    asTrimmed(entities.vertical) ||
    asTrimmed(entities.category) ||
    asTrimmed(entities.storeType) ||
    null;
  return {
    businessName: asTrimmed(entities.businessName ?? entities.name),
    detectedBusinessName: asTrimmed(entities.businessName ?? entities.name),
    location,
    businessType: asTrimmed(entities.businessType),
    vertical,
    phone: phones[0] ? asTrimmed(phones[0]) : null,
    email: asTrimmed(entities.email),
    website: asTrimmed(entities.website),
    rawText: text,
    detectedContacts: [
      ...(phones.map((p) => ({ type: 'phone', value: p }))),
      ...(entities.email ? [{ type: 'email', value: entities.email }] : []),
    ],
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} ocrHints
 * @param {Record<string, unknown> | null | undefined} entityContext
 * @param {Record<string, unknown> | null | undefined} extracted
 * @param {string} [documentType]
 * @returns {Record<string, unknown> | null}
 */
export function mapAssetContextToExtraction(ocrHints, entityContext, extracted, documentType = 'unknown') {
  const ocr = ocrHints && typeof ocrHints === 'object' ? ocrHints : {};
  const ctx = entityContext && typeof entityContext === 'object' ? entityContext : {};
  const ext = extracted && typeof extracted === 'object' ? extracted : {};
  const dt = String(documentType ?? ctx.documentType ?? ctx.assetType ?? 'unknown').trim();

  const name =
    asTrimmed(ocr.businessName ?? ocr.detectedBusinessName) ||
    asTrimmed(ctx.detectedBusinessName) ||
    asTrimmed(ext.title) ||
    null;
  const location =
    asTrimmed(ocr.location) ||
    (Array.isArray(ctx.detectedLocations) && ctx.detectedLocations[0]
      ? asTrimmed(ctx.detectedLocations[0])
      : null);
  const vertical =
    asTrimmed(ocr.vertical) ||
    asTrimmed(ocr.businessType) ||
    mapVerticalSlugToCategory(ocr.vertical) ||
    null;
  const categoryHint =
    vertical ||
    inferStoreCategoryFromHint(null, name ?? '', location ?? '') ||
    (dt === 'flyer' || dt === 'brochure' ? inferStoreCategoryFromHint(ext.title, name ?? '', location ?? '') : null);

  const phone =
    asTrimmed(ocr.phone) ||
    (Array.isArray(ocr.detectedContacts)
      ? asTrimmed(ocr.detectedContacts.find((c) => c?.type === 'phone')?.value)
      : null);
  const email =
    asTrimmed(ocr.email) ||
    (Array.isArray(ocr.detectedContacts)
      ? asTrimmed(ocr.detectedContacts.find((c) => c?.type === 'email')?.value)
      : null);
  const website = asTrimmed(ocr.website) || extractFirstUrlFromText(ocr.rawText ?? ext.rawText ?? '');

  let source = 'ocr';
  if (dt === 'business_card') source = 'business_card';
  else if (dt === 'storefront_photo') source = 'ocr';
  else if (dt === 'flyer' || dt === 'brochure') source = 'flyer';
  else if (dt === 'menu') source = 'ocr';
  if (website && extractFirstUrlFromText(ocr.rawText ?? '') && !ocr.businessName) source = 'qr';

  return {
    name,
    location,
    category: categoryHint,
    phone,
    email,
    website,
    source,
    documentType: dt,
    keywords: Array.isArray(ext.items) ? ext.items.slice(0, 8) : [],
    confidence: typeof ctx.confidence === 'number' ? ctx.confidence : null,
  };
}

/**
 * @param {{
 *   ingestResult?: Record<string, unknown> | null;
 *   imageContext?: { extractedText?: string } | null;
 *   userMessage?: string;
 *   intentSourceContext?: Record<string, unknown> | null;
 * }} input
 */
export function buildAssetExtractionInput(input = {}) {
  const ingest = input.ingestResult && typeof input.ingestResult === 'object' ? input.ingestResult : null;
  const fromIntent =
    input.intentSourceContext?.assetIngestResult &&
    typeof input.intentSourceContext.assetIngestResult === 'object'
      ? input.intentSourceContext.assetIngestResult
      : null;
  const fromPersisted =
    input.persistedIngestResult && typeof input.persistedIngestResult === 'object'
      ? input.persistedIngestResult
      : null;
  const effectiveIngest = ingest ?? fromIntent ?? fromPersisted;

  let ocrHints = null;
  if (input.imageContext?.extractedText) {
    ocrHints = buildOcrHintsFromImageText(input.imageContext.extractedText);
  } else if (effectiveIngest?.entityContext || effectiveIngest?.extracted) {
    ocrHints =
      (effectiveIngest.ocrHints && typeof effectiveIngest.ocrHints === 'object'
        ? effectiveIngest.ocrHints
        : null) ?? buildOcrHintsFromImageText(effectiveIngest.rawOcrText ?? '');
  }

  const cardExtraction =
    input.intentSourceContext?.cardExtraction &&
    typeof input.intentSourceContext.cardExtraction === 'object'
      ? input.intentSourceContext.cardExtraction
      : null;
  if (cardExtraction) {
    const clientHints = {
      businessName: asTrimmed(cardExtraction.businessName),
      detectedBusinessName: asTrimmed(cardExtraction.businessName),
      location: asTrimmed(cardExtraction.location),
      vertical: asTrimmed(cardExtraction.vertical ?? cardExtraction.category),
      businessType: asTrimmed(cardExtraction.vertical ?? cardExtraction.category),
    };
    ocrHints = ocrHints ? { ...clientHints, ...ocrHints } : clientHints;
  }

  const entityContext = effectiveIngest?.entityContext ?? null;
  const extracted = effectiveIngest?.extracted ?? entityContext?.extractedContent ?? null;
  const documentType = entityContext?.documentType ?? entityContext?.assetType ?? 'unknown';

  let assetExtraction = mapAssetContextToExtraction(ocrHints, entityContext, extracted, documentType);

  const urlFromMessage = extractFirstUrlFromText(input.userMessage ?? '');
  if (urlFromMessage && assetExtraction && !assetExtraction.website) {
    assetExtraction = { ...assetExtraction, website: urlFromMessage, source: assetExtraction.source || 'website' };
  }

  return assetExtraction;
}

/**
 * @param {Record<string, unknown> | null | undefined} assetExtraction
 */
export function hasMeaningfulAssetExtraction(assetExtraction) {
  if (!assetExtraction || typeof assetExtraction !== 'object') return false;
  return Boolean(
    assetExtraction.name ||
      assetExtraction.location ||
      assetExtraction.phone ||
      assetExtraction.email ||
      assetExtraction.website ||
      (assetExtraction.category && String(assetExtraction.category).toLowerCase() !== 'other'),
  );
}

/**
 * @param {{
 *   ingestResult?: Record<string, unknown> | null;
 *   assetExtraction?: Record<string, unknown> | null;
 *   userMessage?: string;
 *   explicitCreateStore?: boolean;
 * }} input
 */
export function shouldRouteIngestToStoreCreationDraft(input = {}) {
  const ingest = input.ingestResult ?? {};
  const entityContext = ingest.entityContext ?? {};
  const dt = String(entityContext.documentType ?? entityContext.assetType ?? '').trim();
  const assetExtraction = input.assetExtraction ?? null;
  const explicit = Boolean(input.explicitCreateStore);

  if (!hasMeaningfulAssetExtraction(assetExtraction)) return false;

  if (dt === 'business_card') return true;
  if (STORE_DRAFT_DIRECT_ASSET_TYPES.has(dt) && entityContext.detectedBusinessName) return true;
  if (explicit) return true;
  if (assetExtraction?.source === 'qr' && assetExtraction?.name) return true;

  return false;
}

/**
 * Flyer/menu uploads keep action selection but may include a partial draft summary.
 * @param {Record<string, unknown> | null | undefined} ingestResult
 */
export function shouldAttachDraftToAssetSelection(ingestResult) {
  const dt = String(
    ingestResult?.entityContext?.documentType ?? ingestResult?.entityContext?.assetType ?? '',
  ).trim();
  return ['flyer', 'brochure', 'menu', 'product_catalog', 'price_list', 'loyalty_card'].includes(dt);
}

/**
 * Lightweight website metadata for store draft (no LLM).
 * @param {string} websiteUrl
 */
export async function resolveWebsiteMetadataForStoreDraft(websiteUrl) {
  const raw = String(websiteUrl ?? '').trim();
  if (!raw) return null;
  let url = raw;
  if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^www\./i, 'www.')}`;

  const fallbackName = domainToDisplayName(url);
  const out = {
    website: url,
    name: fallbackName,
    location: null,
    category: null,
    phone: null,
    email: null,
    source: 'website',
    documentType: 'website',
  };

  const html = await fetchHtml(url, { timeoutMs: 8000 });
  if (!html) return out;

  const ogSite = extractMetaContent(html, 'og:site_name');
  const ogTitle = extractMetaContent(html, 'og:title');
  const title = extractTitle(html);
  const name = asTrimmed(ogSite) || asTrimmed(ogTitle) || asTrimmed(title) || fallbackName;
  if (name) out.name = name.replace(/\s*[|\-–—]\s*.+$/, '').trim() || name;

  const description = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description');
  out.category = inferStoreCategoryFromHint(description, out.name ?? '', '');

  const ldNodes = extractJsonLd(html);
  for (const node of ldNodes) {
    const type = String(node['@type'] ?? '').toLowerCase();
    if (!/localbusiness|organization|store|restaurant|foodestablishment/.test(type)) continue;
    if (!out.name && node.name) out.name = asTrimmed(node.name);
    if (!out.phone && node.telephone) out.phone = asTrimmed(node.telephone);
    if (!out.email && node.email) out.email = asTrimmed(node.email);
    if (!out.location && node.address) {
      if (typeof node.address === 'string') out.location = asTrimmed(node.address);
      else if (typeof node.address === 'object') {
        out.location =
          asTrimmed(
            [node.address.streetAddress, node.address.addressLocality, node.address.addressRegion]
              .filter(Boolean)
              .join(', '),
          ) || null;
      }
    }
    break;
  }

  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} base
 * @param {Record<string, unknown> | null | undefined} patch
 */
export function mergeAssetExtraction(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const merged = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value != null && String(value).trim()) merged[key] = value;
  }
  return merged;
}

/**
 * @param {import('./storeCreationDraft.js').StoreCreationDraftBundle} bundle
 * @param {{ documentType?: string; source?: string }} [meta]
 */
export function formatAssetStoreDraftResponse(bundle, meta = {}) {
  const draft = bundle?.draft ?? {};
  const name = stripQuotes(draft.name);
  const location = stripQuotes(draft.location);
  const category = stripQuotes(draft.category);
  const phone = stripQuotes(draft.phone);
  const email = stripQuotes(draft.email);
  const website = stripQuotes(draft.website);

  const dt = String(meta.documentType ?? draft.source ?? '').trim();
  const intro =
    dt === 'business_card'
      ? 'From your business card, I extracted:'
      : dt === 'flyer' || dt === 'brochure'
        ? 'From this flyer, I found:'
        : dt === 'website' || meta.source === 'website'
          ? 'From this website, I found:'
          : dt === 'qr' || draft.source === 'qr'
            ? 'From the QR code, I found:'
            : 'I found these details:';

  const found = [];
  if (name) found.push(`✓ Store name\n${name}`);
  if (category && category.toLowerCase() !== 'other') found.push(`✓ Category\n${category}`);
  if (location) found.push(`✓ Location\n${location}`);
  if (phone) found.push(`✓ Phone\n${phone}`);
  if (email) found.push(`✓ Email\n${email}`);
  if (website) found.push(`✓ Website\n${website}`);

  const body = found.length > 0 ? `${intro}\n\n${found.join('\n\n')}\n\n` : `${intro}\n\n`;

  if (bundle.isComplete) {
    return `${body}Everything looks complete.\n\nReady to create your store?`;
  }
  return `${body}I need a bit more detail before we can create your store.`;
}

const ASSET_DRAFT_SOURCES = new Set([
  'ocr',
  'business_card',
  'website',
  'qr',
  'flyer',
  'pill',
]);

/**
 * @param {{ draft?: { source?: string } }} bundle
 */
export function isAssetSourcedStoreDraft(bundle) {
  const source = String(bundle?.draft?.source ?? '').trim().toLowerCase();
  return ASSET_DRAFT_SOURCES.has(source);
}

/**
 * @param {import('./storeCreationDraft.js').StoreCreationDraftBundle} bundle
 * @param {{ documentType?: string; source?: string }} [meta]
 */
export function formatStoreCreationDraftResponseForBundle(bundle, meta = {}) {
  if (isAssetSourcedStoreDraft(bundle)) {
    return formatAssetStoreDraftResponse(bundle, {
      documentType: meta.documentType ?? bundle.draft?.source,
      source: meta.source ?? bundle.draft?.source,
    });
  }
  return formatStoreCreationDraftResponse(bundle);
}

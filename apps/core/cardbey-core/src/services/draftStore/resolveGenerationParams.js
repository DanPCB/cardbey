/**
 * Normalize legacy knobs (mode, menuFirstMode, useAiMenu, templateId, ocr) into a single
 * set of generation params. Prevents accidental divergence between "AI on" and "AI off" paths.
 *
 * Precedence: explicit mode > draftMode > menuFirstMode/useAiMenu => ai > templateId => template > ocr => ocr > else error.
 * - includeImages defaults true (input.includeImages !== false).
 * - Template mode hard-fails if templateId is missing or invalid (caller must validate).
 */

import { resolveStoreCreationClassification } from './resolveStoreCreationClassification.js';
import { resolveVertical } from '../../lib/verticals/verticalTaxonomy.js';

/**
 * @param {Record<string, any>} input - Raw draft.input (from API or orchestra)
 * @param {{ draftMode?: string }} [opts] - draft.mode when input.mode is absent (e.g. orchestra sets draft.mode = 'ai')
 * @returns {{ mode: 'template'|'ai'|'ocr', templateId?: string, includeImages: boolean, vertical?: string, prompt?: string, businessName?: string, businessType?: string, location?: string, currencyCode?: string, priceTier?: string, ocrRawText?: string, photoDataUrl?: string, intent?: string }}
 */
export function resolveGenerationParams(input, opts = {}) {
  const raw = input || {};
  const draftMode = opts.draftMode && String(opts.draftMode).toLowerCase().trim();

  let mode;
  if (raw.mode != null && String(raw.mode).trim() !== '') {
    const m = String(raw.mode).toLowerCase().trim();
    if (m === 'template' || m === 'ai' || m === 'ocr' || m === 'seed') mode = m;
  }
  if (mode == null && (draftMode === 'template' || draftMode === 'ai' || draftMode === 'ocr')) {
    mode = draftMode;
  }
  if (mode == null && (raw.menuFirstMode === true || raw.useAiMenu === true || raw.menuOnly === true || raw.ignoreImages === true)) {
    mode = 'ai';
  }
  if (mode == null && raw.templateId != null && String(raw.templateId).trim() !== '') {
    mode = 'template';
  }
  if (mode == null && (raw.ocr === true || String(raw.mode || '').toLowerCase() === 'ocr')) {
    mode = 'ocr';
  }
  if (mode == null && raw.seedItems != null && Array.isArray(raw.seedItems) && raw.seedItems.length > 0) {
    mode = 'seed';
  }
  if (mode == null) {
    throw new Error('Missing mode or templateId: provide mode ("template"|"seed"|"ai"|"ocr") or templateId for template mode.');
  }

  const templateId = raw.templateId != null ? String(raw.templateId).trim() : undefined;
  if (mode === 'template' && (!templateId || templateId.length === 0)) {
    throw new Error('Template mode requires a valid templateId. Please choose a template.');
  }

  // OCR-only is free_api (no AI images) unless user opts in via includeImages: true or useAiImprove / useAiImages
  const includeImages =
    mode === 'ocr'
      ? (raw.includeImages === true || raw.useAiImprove === true || raw.useAiImages === true)
      : (raw.includeImages !== false);
  const vertical = raw.vertical != null ? String(raw.vertical).trim() : (raw.businessType || raw.storeType) ? String(raw.businessType || raw.storeType).trim() : undefined;

  const classificationBundle = resolveStoreCreationClassification(raw);
  const categoryHint =
    raw.storeType != null && String(raw.storeType).trim()
      ? String(raw.storeType).trim()
      : raw.businessType != null && String(raw.businessType).trim()
        ? String(raw.businessType).trim()
        : raw.category != null && String(raw.category).trim()
          ? String(raw.category).trim()
          : undefined;
  const verticalResolved = resolveVertical({
    businessType: categoryHint,
    businessName: raw.businessName ?? raw.storeName,
    userNotes: [raw.location, raw.prompt].filter(Boolean).join(' '),
    explicitVertical: raw.verticalSlug != null ? String(raw.verticalSlug).trim() : null,
  });

  return {
    mode,
    templateId: mode === 'template' ? templateId : undefined,
    seedItems: mode === 'seed' ? (Array.isArray(raw.seedItems) ? raw.seedItems : []) : undefined,
    includeImages,
    vertical,
    verticalSlug: raw.verticalSlug != null ? String(raw.verticalSlug).trim() : undefined,
    audience: raw.audience != null ? String(raw.audience).trim().toLowerCase() : undefined,
    prompt: raw.prompt != null ? String(raw.prompt) : undefined,
    businessName: raw.businessName != null ? String(raw.businessName).trim() : undefined,
    businessType: raw.businessType != null ? String(raw.businessType).trim() : undefined,
    storeType: raw.storeType != null ? String(raw.storeType).trim() : undefined,
    location: raw.location != null ? String(raw.location) : undefined,
    website:
      raw.website != null && String(raw.website).trim()
        ? String(raw.website).trim()
        : raw.websiteUrl != null && String(raw.websiteUrl).trim()
          ? String(raw.websiteUrl).trim()
          : undefined,
    websiteUrl:
      raw.websiteUrl != null && String(raw.websiteUrl).trim()
        ? String(raw.websiteUrl).trim()
        : raw.website != null && String(raw.website).trim()
          ? String(raw.website).trim()
          : undefined,
    currencyCode:
      raw.currencyCode != null && String(raw.currencyCode).trim()
        ? String(raw.currencyCode).trim().toUpperCase()
        : raw.currency != null && String(raw.currency).trim()
          ? String(raw.currency).trim().toUpperCase()
          : undefined,
    priceTier: raw.priceTier != null ? String(raw.priceTier) : undefined,
    locale: raw.locale || raw.regionCode,
    ocrRawText: raw.ocrRawText,
    photoDataUrl: raw.photoDataUrl,
    intent: raw.intent != null ? String(raw.intent).trim() : undefined,
    classificationProfile: classificationBundle.classificationProfile,
    generationProfile: classificationBundle.generationProfile,
    catalogGenerationProfile: classificationBundle.catalogGenerationProfile,
    canonicalBusinessType: classificationBundle.classification.businessType,
    catalogMode: classificationBundle.classification.catalogMode,
    catalogLabel: classificationBundle.classification.catalogLabel,
    primaryCTA: classificationBundle.classification.primaryCTA,
    generatedContentProfile: classificationBundle.classification.generatedContentProfile,
    verticalSlug:
      raw.verticalSlug != null && String(raw.verticalSlug).trim()
        ? String(raw.verticalSlug).trim()
        : verticalResolved.slug,
    verticalGroup: verticalResolved.group,
  };
}

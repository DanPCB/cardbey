/**
 * Canonical asset ingest → entity context → suggested intents (no mission until user selects).
 */

import { randomUUID } from 'node:crypto';
import { ASSET_INTENT_EVENTS, logAssetIntentProbe } from './assetIntentTelemetry.js';
import { extractAssetContent } from './assetExtraction.js';
import { formatAssetDisplay } from './assetContentDisplay.js';

/** @typedef {'business_card'|'storefront_photo'|'menu'|'product_catalog'|'price_list'|'loyalty_card'|'flyer'|'brochure'|'invoice'|'contract'|'general_document'|'unknown'} AssetDocumentType */

/**
 * @param {{ mimeType?: string, filename?: string, ocrHints?: Record<string, unknown> | null }} input
 * @returns {AssetDocumentType}
 */
export function classifyUploadedAssetType(input = {}) {
  const mime = String(input.mimeType ?? '').toLowerCase();
  const name = String(input.filename ?? '').toLowerCase();
  const ocr = input.ocrHints && typeof input.ocrHints === 'object' ? input.ocrHints : {};
  const businessName = String(ocr.businessName ?? ocr.detectedBusinessName ?? '').trim();

  if (/loyalty|stamp|rewards?/.test(name)) return 'loyalty_card';
  if (/menu/.test(name)) return 'menu';
  if (/catalog|products?/.test(name)) return 'product_catalog';
  if (/price|pricing/.test(name)) return 'price_list';
  if (/flyer|poster|promo/.test(name)) return 'flyer';
  if (/brochure/.test(name)) return 'brochure';
  if (/invoice|receipt|bill/.test(name)) return 'invoice';
  if (/contract|agreement/.test(name)) return 'contract';
  if (/storefront|store.?front|shop/.test(name)) return 'storefront_photo';

  if (/business.?card/i.test(name) || (businessName && /image\//.test(mime))) {
    return businessName ? 'business_card' : /image\//.test(mime) ? 'storefront_photo' : 'unknown';
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'general_document';
  if (/image\//.test(mime)) return businessName ? 'business_card' : 'unknown';
  if (/text\//.test(mime) || /\.(txt|csv|doc|docx|xlsx)$/i.test(name)) return 'general_document';
  return 'unknown';
}

/**
 * @param {object} input
 */
export function buildAssetEntityContext(input = {}) {
  const documentType = classifyUploadedAssetType(input);
  const ocr = input.ocrHints && typeof input.ocrHints === 'object' ? input.ocrHints : {};
  const detectedBusinessName = String(ocr.businessName ?? ocr.detectedBusinessName ?? '').trim() || null;
  const detectedLocations = ocr.location ? [String(ocr.location).trim()] : [];
  const confidence =
    documentType === 'business_card' && detectedBusinessName
      ? 0.88
      : documentType === 'unknown'
        ? 0.35
        : 0.72;

  return {
    id: input.entityContextId ?? randomUUID(),
    assetType: documentType,
    documentType,
    detectedBusinessName,
    detectedProducts: Array.isArray(ocr.detectedProducts) ? ocr.detectedProducts : [],
    detectedServices: Array.isArray(ocr.detectedServices) ? ocr.detectedServices : [],
    detectedLocations,
    detectedContacts: Array.isArray(ocr.detectedContacts) ? ocr.detectedContacts : [],
    detectedPrices: Array.isArray(ocr.detectedPrices) ? ocr.detectedPrices : [],
    detectedDates: Array.isArray(ocr.detectedDates) ? ocr.detectedDates : [],
    detectedBrandAssets: Array.isArray(ocr.detectedBrandAssets) ? ocr.detectedBrandAssets : [],
    confidence,
    mimeType: input.mimeType ?? null,
    filename: input.filename ?? null,
    fileAssetId: input.fileAssetId ?? null,
    summary: buildAssetSummary(documentType, detectedBusinessName, input.filename),
    source: input.source ?? 'performer',
    currentEntry: input.currentEntry ?? 'performer',
    userPrompt: input.userPrompt ?? null,
    imageDataUrl: input.imageDataUrl ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {AssetDocumentType} documentType
 * @param {string | null} businessName
 * @param {string | null | undefined} filename
 */
function buildAssetSummary(documentType, businessName, filename) {
  const name = businessName ? ` for ${businessName}` : '';
  const file = filename ? ` (${filename})` : '';
  switch (documentType) {
    case 'business_card':
      return `Business card detected${name}${file}.`;
    case 'menu':
    case 'product_catalog':
    case 'price_list':
      return `Menu or catalog document${file}.`;
    case 'loyalty_card':
      return `Loyalty or rewards card${file}.`;
    case 'flyer':
    case 'brochure':
      return `Marketing flyer or brochure${file}.`;
    case 'invoice':
    case 'contract':
      return `Business document${file}.`;
    case 'storefront_photo':
      return `Storefront or business photo${file}.`;
    default:
      return `Uploaded file${file}. Choose what you want to do with it.`;
  }
}

/**
 * @param {ReturnType<typeof buildAssetEntityContext>} entityContext
 * @param {ReturnType<typeof extractAssetContent> | null} [extracted]
 */
export function suggestAssetIntentActions(entityContext, extracted = null) {
  const dt = entityContext.documentType;
  const contentType = extracted?.detectedType ?? null;
  const highConfidenceBusiness =
    Boolean(entityContext.detectedBusinessName) && (entityContext.confidence ?? 0) >= 0.75;

  /** @type {Array<{ id: string; label: string; description: string; primary?: boolean; requiresConfirmation?: boolean }>} */
  const suggestions = [];

  const push = (id, label, description, opts = {}) => {
    suggestions.push({ id, label, description, ...opts });
  };

  const eventOrPromo =
    contentType === 'event' ||
    contentType === 'promotion' ||
    dt === 'flyer' ||
    dt === 'brochure';

  switch (dt) {
    case 'business_card':
    case 'storefront_photo':
      if (eventOrPromo) {
        push('launch_campaign', 'Create campaign', 'Turn this into a marketing campaign', { primary: true });
      }
      push('create_store', 'Create store', 'Start a new store from this business', {
        requiresConfirmation: true,
      });
      push('save_contact', 'Save contact / business profile', 'Keep business details without creating a store');
      push('analyze_document', 'Analyze business', 'Review what we detected from this asset');
      if (!eventOrPromo) {
        push('launch_campaign', 'Create campaign', 'Turn this into a marketing campaign');
      }
      break;
    case 'menu':
    case 'product_catalog':
    case 'price_list':
      push('import_catalog', 'Import catalog / menu', 'Extract products and prices into your store');
      push('create_store', 'Create store', 'Build a store using this catalog', { requiresConfirmation: true });
      push('create_offer', 'Create offer', 'Promote items from this document');
      push('launch_campaign', 'Create campaign', 'Market items from this document');
      push('save_to_suitcase', 'Save to Suitcase', 'Archive this document for later');
      break;
    case 'loyalty_card':
      push('setup_loyalty_program', 'Setup loyalty program', 'Draft a loyalty program from this card', { primary: true });
      push('save_to_suitcase', 'Save to Suitcase', 'Keep this card in your vault');
      push('launch_campaign', 'Create campaign', 'Promote your loyalty program');
      break;
    case 'flyer':
    case 'brochure':
      push('launch_campaign', 'Create campaign', 'Turn this into a campaign', { primary: true });
      push('create_store', 'Create landing page / store', 'Build a web presence from this material', {
        requiresConfirmation: true,
      });
      push('import_catalog', 'Import services / products', 'Extract offerings from the document');
      push('save_to_suitcase', 'Save to Suitcase', 'Archive for later');
      push('analyze_document', 'Analyze business', 'Summarize what is in this document');
      break;
    case 'invoice':
    case 'contract':
      push('save_to_suitcase', 'Save to Suitcase', 'Store this document securely', { primary: true });
      push('analyze_document', 'Summarize document', 'Get a plain-language summary');
      push('save_contact', 'Extract business / contact info', 'Pull contacts without creating a store');
      break;
    default:
      if (contentType === 'event' || contentType === 'promotion') {
        push('launch_campaign', 'Create campaign', 'Launch a campaign from this content', { primary: true });
      }
      push('analyze_document', 'Analyze document', 'See what we can extract');
      push('save_to_suitcase', 'Save to Suitcase', 'Archive this file');
      if (highConfidenceBusiness) {
        push('create_store', 'Create store', 'Only if you want a new store from this', { requiresConfirmation: true });
      }
      break;
  }

  push('ask_performer', 'Ask Performer what to do', 'Describe your goal in your own words');

  return suggestions.slice(0, 8);
}

/**
 * @param {object} input
 */
export async function ingestAssetForIntentDetection(input = {}) {
  logAssetIntentProbe(ASSET_INTENT_EVENTS.UPLOAD_RECEIVED, {
    filename: input.filename,
    mimeType: input.mimeType,
    source: input.source,
  });
  logAssetIntentProbe(ASSET_INTENT_EVENTS.INGEST_STARTED, { fileAssetId: input.fileAssetId });

  try {
    const rawOcrText =
      String(input.rawOcrText ?? input.ocrHints?.rawText ?? '').trim() || null;
    const extracted = rawOcrText ? extractAssetContent(rawOcrText) : null;
    const display = formatAssetDisplay(extracted);

    const entityContext = buildAssetEntityContext({
      ...input,
      ocrHints: {
        ...(input.ocrHints && typeof input.ocrHints === 'object' ? input.ocrHints : {}),
        ...(extracted?.title && !input.ocrHints?.businessName
          ? { detectedBusinessName: extracted.title }
          : {}),
      },
    });
    if (extracted) {
      entityContext.extractedContent = extracted;
      entityContext.contentDisplay = display;
      if (extracted.title && !entityContext.detectedBusinessName) {
        entityContext.detectedBusinessName = extracted.title.slice(0, 120);
      }
    }

    logAssetIntentProbe(ASSET_INTENT_EVENTS.ENTITY_CONTEXT_BUILT, {
      entityContextId: entityContext.id,
      documentType: entityContext.documentType,
      confidence: entityContext.confidence,
      contentType: extracted?.detectedType ?? null,
    });

    const suggestedActions = suggestAssetIntentActions(entityContext, extracted);
    logAssetIntentProbe(ASSET_INTENT_EVENTS.SUGGESTIONS_READY, {
      entityContextId: entityContext.id,
      count: suggestedActions.length,
    });
    logAssetIntentProbe(ASSET_INTENT_EVENTS.AWAITING_USER, { entityContextId: entityContext.id });

    const ocrHintsOut = {
      ...(input.ocrHints && typeof input.ocrHints === 'object' ? input.ocrHints : {}),
      ...(entityContext.detectedBusinessName
        ? { businessName: entityContext.detectedBusinessName, detectedBusinessName: entityContext.detectedBusinessName }
        : {}),
      ...(entityContext.detectedLocations?.[0] ? { location: entityContext.detectedLocations[0] } : {}),
      ...(rawOcrText ? { rawText: rawOcrText } : {}),
    };

    return {
      ok: true,
      phase: 'awaiting_intent_selection',
      entityContext,
      suggestedActions,
      extracted,
      display,
      confidence: entityContext.confidence,
      rawOcrText,
      ocrHints: ocrHintsOut,
      imageDataUrl: input.imageDataUrl ?? entityContext.imageDataUrl ?? null,
      evidence: {
        documentType: entityContext.documentType,
        detectedBusinessName: entityContext.detectedBusinessName,
        filename: entityContext.filename,
        contentType: extracted?.detectedType ?? null,
      },
    };
  } catch (err) {
    logAssetIntentProbe(ASSET_INTENT_EVENTS.FAILED, { message: err?.message ?? String(err) });
    return {
      ok: false,
      phase: 'failed',
      error: { message: err?.message ?? 'asset_ingest_failed' },
    };
  }
}

/**
 * Intake classification shape for attachment-only uploads.
 * @param {string} message
 * @param {object} [context]
 */
export function buildAssetIntentDetectionClassification(message, context = {}) {
  const attachment = Array.isArray(context.attachments) ? context.attachments[0] : null;
  const imageDataUrl =
    context.imageDataUrl ??
    (attachment && typeof attachment === 'object'
      ? attachment.dataUrl ?? attachment.uri ?? attachment.imageDataUrl
      : null);

  return {
    executionPath: 'direct_action',
    tool: 'ingest_asset_for_intent_detection',
    confidence: 0.92,
    parameters: {
      ...(context.storeId ? { storeId: context.storeId } : {}),
      mimeType: attachment?.mimeType ?? context.mimeType ?? null,
      filename: attachment?.name ?? context.filename ?? null,
      imageDataUrl: imageDataUrl ?? null,
      userPrompt: String(message ?? '').trim() || null,
      source: context.source ?? 'performer_composer',
      currentEntry: context.currentEntry ?? 'performer',
    },
    _fastPath: 'asset_intent_detection',
  };
}

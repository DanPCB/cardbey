/**
 * StoreCreationDraft — canonical store-creation object for reasoning-first intake.
 * All sources (chat, OCR, form, pill) converge here before UI or checkpoint dispatch.
 */

import {
  isBareStoreCreateRequest,
  parseStructuredStoreCreatePillMessage,
} from '../intent/storeCreateFastPath.js';
import {
  extractMultiStoreInfo,
  generateMultiStoreClarificationResponse,
  isMultiStoreRequest,
  isVagueLocationPhrase,
} from '../multiAgent/multiStorePlanHelpers.ts';
import { canonicalizeCreateStoreCategory } from './intakeErrorTypes.js';

const WRAP_QUOTE_RE = /^[\s"'`\u201c\u201d\u2018\u2019]+|[\s"'`\u201c\u201d\u2018\u2019]+$/g;

/** Canonical assistant intro when no store fields are known yet. */
export const STORE_CREATION_INTRO_COPY = {
  store: "Let's set up your store. I need a few details to get started.",
  website: "Let's set up your mini website. I need a few details to get started.",
};

/** @typedef {'name' | 'location' | 'category'} StoreCreationDraftField */

/**
 * @typedef {Object} StoreCreationDraft
 * @property {string | null} name
 * @property {string | null} location
 * @property {string | null} category
 * @property {string | null} website
 * @property {string | null} phone
 * @property {string | null} email
 * @property {string | null} logo
 * @property {string | null} source
 * @property {number} confidence
 * @property {Record<string, string>} extractedFields
 */

/**
 * @typedef {Object} StoreCreationDraftBundle
 * @property {'create_store'} intent
 * @property {'store' | 'website'} intentMode
 * @property {StoreCreationDraft} draft
 * @property {StoreCreationDraftField[]} missingFields
 * @property {boolean} isComplete
 * @property {boolean} [needsClarification]
 * @property {import('../multiAgent/multiStorePlanHelpers.ts').MultiStoreExtractedInfo | null} [multiStore]
 */

function stripQuotes(value) {
  return String(value ?? '')
    .replace(WRAP_QUOTE_RE, '')
    .trim();
}

function asTrimmedString(value) {
  const s = stripQuotes(value);
  return s || null;
}

/** Possessive / placeholder phrases — not real business names. */
const GENERIC_STORE_NAMES = new Set([
  'my business',
  'my store',
  'my shop',
  'my cafe',
  'my restaurant',
  'my company',
  'the business',
  'the store',
  'a business',
  'a store',
  'a shop',
  'new store',
  'untitled store',
  'start business',
  'start a business',
]);

/**
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function isGenericStoreName(name) {
  const norm = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!norm || norm.length < 2) return true;
  if (GENERIC_STORE_NAMES.has(norm)) return true;
  if (/^(my|the|a|an)\s+(business|store|shop|cafe|company|restaurant)$/i.test(norm)) return true;
  if (/^(store|shop|business)$/i.test(norm)) return true;
  // Card section headers / slogans mis-picked as the trading name
  if (/^(we|our|i)\s+(speciali[sz]e|offer|provide|serve|feature)\b/.test(norm)) return true;
  if (/speciali[sz]e\s+in\s*:?\s*$/.test(norm)) return true;
  if (/:\s*$/.test(norm) && norm.length < 28) return true;
  if (/^(welcome|opening hours|hours|services|menu|about us|contact us)\b/.test(norm)) return true;
  return false;
}

/**
 * @param {string | null | undefined} name
 * @returns {string | null}
 */
export function sanitizeExtractedStoreName(name) {
  const cleaned = asTrimmedString(name);
  return isGenericStoreName(cleaned) ? null : cleaned;
}

/**
 * @param {{ name?: string | null; location?: string | null; category?: string | null; source: string }} parsed
 */
function finalizeParsedStoreCreation(parsed) {
  const name = sanitizeExtractedStoreName(parsed.name);
  const location = asTrimmedString(parsed.location);
  return {
    name,
    location,
    category:
      parsed.category ?? inferStoreCategoryFromHint(null, name ?? '', location ?? ''),
    source: parsed.source,
  };
}

/**
 * Map free-text business type hints to dashboard category labels.
 * @param {string | null | undefined} hint
 * @param {string} name
 * @param {string | null} location
 */
export function inferStoreCategoryFromHint(hint, name = '', location = '') {
  const fromHint = stripQuotes(hint);
  if (fromHint && fromHint.length >= 2) {
    return canonicalizeCreateStoreCategory(fromHint);
  }
  const text = `${name ?? ''} ${location ?? ''} ${hint ?? ''}`.toLowerCase();
  if (/sign|signage|display|billboard|banner/i.test(text)) {
    return canonicalizeCreateStoreCategory('signage');
  }
  if (/hair|beauty|salon|spa|nail|barber/i.test(text)) return 'Beauty';
  if (/cafe|coffee|restaurant|food|pizza|sushi|bakery|bar\b/i.test(text)) return 'Food & drink';
  if (/construction|construct|builder|building|contractor|renovat|carpentry|trade|handyman/i.test(text)) {
    return 'Home & garden';
  }
  if (/furniture|sofa|chair|decor|home\s+goods|interior/i.test(text)) return 'Home & garden';
  if (/car\s*wash|auto|mechanic|tyre|detailing/i.test(text)) {
    return canonicalizeCreateStoreCategory('automotive');
  }
  if (/gym|fitness|yoga|sport|training|pilates/i.test(text)) return 'Sports';
  if (/fashion|cloth|dress|wear|apparel|boutique/i.test(text)) return 'Fashion';
  if (/health|pharmacy|medical|clinic|dental/i.test(text)) return 'Health';
  if (/tech|software|digital|IT\b|computer/i.test(text)) {
    return canonicalizeCreateStoreCategory('technology');
  }
  return 'Other';
}

/**
 * Parse NL store-creation phrases into structured fields.
 *
 * @param {string} raw
 * @returns {{ name: string | null, location: string | null, category: string | null, source: string }}
 */
export function parseNaturalLanguageStoreCreation(raw) {
  const userMessage = String(raw ?? '').trim();
  if (!userMessage) {
    return { name: null, location: null, category: null, source: 'empty' };
  }

  if (isMultiStoreRequest(userMessage)) {
    const info = extractMultiStoreInfo(userMessage);
    return finalizeParsedStoreCreation({
      name: info.names[0] ?? null,
      location: info.locations[0] ?? null,
      category: info.categories[0] ?? null,
      source: 'multi_store',
    });
  }

  if (isBareStoreCreateRequest(userMessage)) {
    const locationMatch = userMessage.match(/\bin\s+(.+?)\.?$/i);
    return finalizeParsedStoreCreation({
      name: null,
      location: locationMatch ? stripQuotes(locationMatch[1]) : null,
      category: null,
      source: 'exact_phrase',
    });
  }

  const pill = parseStructuredStoreCreatePillMessage(userMessage);
  if (pill?.storeName) {
    return finalizeParsedStoreCreation({
      name: asTrimmedString(pill.storeName),
      location: asTrimmedString(pill.location),
      category: inferStoreCategoryFromHint(pill.category, pill.storeName, pill.location),
      source: 'pill',
    });
  }

  // "Create a bakery in Melbourne called ABC Bakery"
  const typeInLocCalled = userMessage.match(
    /^create\s+(?:a\s+)?(.+?)\s+in\s+(.+?)\s+called\s+(.+?)\.?$/i,
  );
  if (typeInLocCalled) {
    const categoryHint = stripQuotes(typeInLocCalled[1]);
    const location = stripQuotes(typeInLocCalled[2]);
    const name = stripQuotes(typeInLocCalled[3]);
    return finalizeParsedStoreCreation({
      name: name || null,
      location: location || null,
      category: inferStoreCategoryFromHint(categoryHint, name, location),
      source: 'nl_type_in_location_called',
    });
  }

  // "Create a store called ABC Bakery in Melbourne"
  const calledIn = userMessage.match(
    /^create\s+(?:a\s+)?(?:store|shop|business|bakery|cafe|restaurant)?\s*(?:called|named)\s+["']?(.+?)["']?\s+in\s+(.+?)\.?$/i,
  );
  if (calledIn) {
    const name = stripQuotes(calledIn[1]);
    const location = stripQuotes(calledIn[2]);
    return finalizeParsedStoreCreation({
      name: name || null,
      location: location || null,
      category: inferStoreCategoryFromHint(null, name, location),
      source: 'nl_called_in',
    });
  }

  // "Create ABC Bakery in Melbourne"
  const nameIn = userMessage.match(/^create\s+(?:a\s+)?(.+?)\s+in\s+(.+?)\.?$/i);
  if (nameIn) {
    const chunk = stripQuotes(nameIn[1]);
    const location = stripQuotes(nameIn[2]);
    const skipGeneric = /^(store|shop|business)$/i.test(chunk);
    if (!skipGeneric && chunk.length >= 2) {
      return finalizeParsedStoreCreation({
        name: chunk,
        location: location || null,
        category: inferStoreCategoryFromHint(null, chunk, location),
        source: 'nl_name_in',
      });
    }
  }

  const nameMatch = userMessage.match(
    /(?:(?:store|shop)\s+for|(?:store|shop)\s+called)\s+["']?(.+?)["']?(?:\s+in\s+|$)/i,
  );
  const locationMatch = userMessage.match(/\bin\s+(.+)$/i);
  let rawName = nameMatch?.[1]?.trim() ?? null;
  let name = rawName ? stripQuotes(rawName) : null;
  if (!name) {
    const tail = userMessage.match(/\b(?:store|shop)\s+for\s+(.+)$/i)?.[1]?.trim() ?? '';
    const splitIdx = tail.search(/\s+in\s+/i);
    const chunk = splitIdx >= 0 ? tail.slice(0, splitIdx) : tail;
    name = stripQuotes(chunk) || null;
  }
  const rawLocation = locationMatch?.[1]?.trim() ?? null;
  let location = rawLocation ? stripQuotes(rawLocation) : null;
  if (name && location && name.toLowerCase().endsWith(` in ${location.toLowerCase()}`)) {
    name = name.slice(0, name.length - (` in ${location}`).length).trim();
  }

  return finalizeParsedStoreCreation({
    name: name || null,
    location: location || null,
    category: inferStoreCategoryFromHint(null, name, location),
    source: 'nl_legacy',
  });
}

/**
 * @param {StoreCreationDraft} draft
 * @returns {StoreCreationDraftField[]}
 */
export function computeMissingStoreCreationFields(draft) {
  /** @type {StoreCreationDraftField[]} */
  const missing = [];
  const name = stripQuotes(draft?.name);
  const location = stripQuotes(draft?.location);
  const category = stripQuotes(draft?.category);
  if (!name || name.length < 2) missing.push('name');
  if (!location || location.length < 2 || isVagueLocationPhrase(location)) missing.push('location');
  if (!category || category.toLowerCase() === 'other') missing.push('category');
  return missing;
}

/**
 * Human-readable assistant line for reasoning-first store creation.
 * @param {StoreCreationDraftBundle} bundle
 */
export function formatStoreCreationDraftResponse(bundle) {
  if (bundle?.multiStore?.isMultiStore) {
    return generateMultiStoreClarificationResponse(bundle.multiStore);
  }

  const draft = bundle?.draft ?? {};
  const name = stripQuotes(draft.name);
  const location = stripQuotes(draft.location);
  const category = stripQuotes(draft.category);
  const found = [];
  if (name) found.push(`✓ Store name\n${name}`);
  if (category && category.toLowerCase() !== 'other') found.push(`✓ Category\n${category}`);
  if (location) found.push(`✓ Location\n${location}`);

  if (bundle.isComplete) {
    const summary = found.length > 0 ? `I found:\n\n${found.join('\n\n')}\n\n` : '';
    return `${summary}Everything looks complete.\n\nReady to create your store?`;
  }

  const missing = bundle.missingFields ?? [];
  if (missing.length === 1 && missing[0] === 'location' && name) {
    return `I know:\n\n✓ Store name\n${name}${
      category && category.toLowerCase() !== 'other' ? `\n\n✓ Category\n${category}` : ''
    }\n\nI'm only missing the location.\n\nWhere is this business located?`;
  }
  if (missing.length === 1 && missing[0] === 'category' && name) {
    return `Almost there for "${name}". What type of business is this?`;
  }
  if (missing.length === 1 && missing[0] === 'name') {
    return 'What should we call this store?';
  }
  if (found.length > 0) {
    return `I found:\n\n${found.join('\n\n')}\n\nI need a bit more detail before we can create your store.`;
  }
  const mode = bundle?.intentMode === 'website' ? 'website' : 'store';
  return STORE_CREATION_INTRO_COPY[mode];
}

/**
 * @param {{
 *   userMessage?: string;
 *   classification?: { parameters?: Record<string, unknown>; confidence?: number } | null;
 *   storeCreateForm?: Record<string, unknown> | null;
 *   memoryContext?: Record<string, unknown> | null;
 *   assetExtraction?: Record<string, unknown> | null;
 * }} input
 * @returns {StoreCreationDraftBundle}
 */
export function buildStoreCreationDraft(input = {}) {
  const userMessage = String(input.userMessage ?? '').trim();
  const params =
    input.classification?.parameters &&
    typeof input.classification.parameters === 'object' &&
    !Array.isArray(input.classification.parameters)
      ? input.classification.parameters
      : {};
  const form =
    input.storeCreateForm && typeof input.storeCreateForm === 'object' && !Array.isArray(input.storeCreateForm)
      ? input.storeCreateForm
      : null;
  const memory =
    input.memoryContext && typeof input.memoryContext === 'object' && !Array.isArray(input.memoryContext)
      ? input.memoryContext
      : {};
  const asset =
    input.assetExtraction && typeof input.assetExtraction === 'object' && !Array.isArray(input.assetExtraction)
      ? input.assetExtraction
      : null;

  const parsed = parseNaturalLanguageStoreCreation(userMessage);
  const pill = parseStructuredStoreCreatePillMessage(userMessage);
  const multiStoreInfo = isMultiStoreRequest(userMessage) ? extractMultiStoreInfo(userMessage) : null;

  const name = sanitizeExtractedStoreName(
    asTrimmedString(form?.storeName) ||
      asTrimmedString(params.storeName ?? params.businessName ?? params.name) ||
      asTrimmedString(asset?.name ?? asset?.businessName) ||
      asTrimmedString(parsed.name),
  );

  const location =
    asTrimmedString(form?.location) ||
    asTrimmedString(params.location) ||
    asTrimmedString(asset?.location) ||
    asTrimmedString(memory.preferredCity ?? memory.activeCity ?? memory.location) ||
    (multiStoreInfo?.vagueLocation ? null : asTrimmedString(parsed.location));

  const categoryRaw =
    asTrimmedString(form?.storeType ?? form?.category ?? form?.businessType) ||
    asTrimmedString(params.storeType ?? params.category ?? params.businessType) ||
    asTrimmedString(asset?.category) ||
    asTrimmedString(pill?.category) ||
    asTrimmedString(parsed.category);

  const category = inferStoreCategoryFromHint(categoryRaw, name ?? '', location ?? '');

  const intentModeRaw = String(
    form?.intentMode ?? params.intentMode ?? pill?.intentMode ?? (asset?.website ? 'website' : 'store'),
  ).trim();
  const intentMode = intentModeRaw === 'website' ? 'website' : 'store';

  const extractedFields = {};
  if (name) extractedFields.name = name;
  if (location) extractedFields.location = location;
  if (category && category !== 'Other') extractedFields.category = category;
  if (asset?.phone) extractedFields.phone = String(asset.phone);
  if (asset?.email) extractedFields.email = String(asset.email);
  if (asset?.website) extractedFields.website = String(asset.website);

  const confidence =
    typeof input.classification?.confidence === 'number' && !Number.isNaN(input.classification.confidence)
      ? input.classification.confidence
      : typeof asset?.confidence === 'number' && !Number.isNaN(asset.confidence)
        ? asset.confidence
        : name && location && category !== 'Other'
          ? 0.95
          : name
            ? 0.75
            : 0.5;

  const assetMeaningful = Boolean(
    asset &&
      (asset.name ||
        asset.location ||
        asset.phone ||
        asset.email ||
        asset.website ||
        (asset.category && String(asset.category).toLowerCase() !== 'other')),
  );
  const draftSource = String(
    params.source ??
      (assetMeaningful && asset?.source ? asset.source : null) ??
      (form ? 'form' : assetMeaningful ? 'ocr' : parsed.source ?? 'reasoning'),
  );

  /** @type {StoreCreationDraft} */
  const draft = {
    name,
    location,
    category: category !== 'Other' ? category : categoryRaw,
    website: asTrimmedString(params.website ?? form?.websiteUrl ?? asset?.website),
    phone: asTrimmedString(params.phone ?? asset?.phone),
    email: asTrimmedString(params.email ?? asset?.email),
    logo: asTrimmedString(params.logoUrl ?? params.logo ?? asset?.logo),
    source: draftSource,
    confidence,
    extractedFields,
  };

  const missingFields = computeMissingStoreCreationFields(draft);

  return {
    intent: 'create_store',
    intentMode,
    draft,
    missingFields,
    isComplete: missingFields.length === 0 && !multiStoreInfo?.missingFields?.length,
    ...(multiStoreInfo?.isMultiStore
      ? {
          needsClarification: multiStoreInfo.missingFields.length > 0,
          multiStore: multiStoreInfo,
        }
      : {}),
  };
}

/**
 * Legacy adapter for routes that expect storeName/location/storeType keys.
 * @param {string} raw
 */
export function parseStoreCreationFromUserMessage(raw) {
  const parsed = parseNaturalLanguageStoreCreation(raw);
  return {
    storeName: parsed.name,
    location: parsed.location,
    storeType: parsed.category ?? 'Other',
  };
}

/**
 * True when intake body is a reasoning-first draft confirmation (not NL discovery).
 * @param {Record<string, unknown> | null | undefined} body
 */
export function isStoreCreationDraftConfirmationSubmit(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const source = String(body.source ?? '').trim();
  const intentSource = String(body.intentSource ?? '').trim();
  if (source === 'store_creation_draft' || intentSource === 'store_creation_draft') return true;
  if (body._autoSubmit === true && body.storeCreationDraft) return true;
  const params =
    body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
      ? body.parameters
      : null;
  return Boolean(params?._autoSubmit === true && body.storeCreationDraft);
}

/**
 * Map `storeCreationDraft` submit payload → `storeCreateForm` envelope for checkpoint dispatch.
 * @param {unknown} raw
 * @param {{ intentMode?: string }} [opts]
 * @returns {Record<string, string> | null}
 */
export function resolveStoreCreateFormFromDraftSubmitBody(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const root = /** @type {Record<string, unknown>} */ (raw);
  const nested =
    root.draft && typeof root.draft === 'object' && !Array.isArray(root.draft)
      ? /** @type {Record<string, unknown>} */ (root.draft)
      : root;
  const storeName = asTrimmedString(nested.name ?? nested.storeName);
  const location = asTrimmedString(nested.location);
  const storeType = asTrimmedString(nested.category ?? nested.storeType ?? nested.businessType);
  if (!storeName && !location) return null;
  const intentMode =
    String(opts.intentMode ?? nested.intentMode ?? root.intentMode ?? 'store').trim().toLowerCase() ===
    'website'
      ? 'website'
      : 'store';
  return {
    ...(storeName ? { storeName } : {}),
    ...(location ? { location } : {}),
    ...(storeType ? { storeType, category: storeType } : {}),
    intentMode,
  };
}

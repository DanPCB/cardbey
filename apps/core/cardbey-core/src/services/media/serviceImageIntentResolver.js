/**
 * Canonicalise services and build visual search intent for stock-image resolution.
 */

import { resolveBlueprintItemImageHint } from '../draftStore/itemImageQueryResolver.js';

/** @typedef {import('./serviceImageTypes.js').ServiceImageIntent} ServiceImageIntent */

const SOURCE_SUFFIX_RE =
  /\s+(-\s*)?(chef'?s?|house|special|style\s+[a-z]+|option\s+\d+|from\s+\w+|via\s+\w+)$/i;

const GENERIC_QUERY_TERMS = new Set([
  'repair',
  'maintenance',
  'home',
  'service',
  'handyman',
  'installation',
  'professional',
  'business',
]);

/** @type {Record<string, Partial<ServiceImageIntent>>} */
const SERVICE_INTENT_PROFILES = {
  'fence repair': {
    canonicalCategory: 'outdoor_repairs',
    subjectTerms: ['handyman', 'carpenter', 'tradesperson'],
    actionTerms: ['repairing', 'fixing', 'replacing'],
    objectTerms: ['wooden fence', 'fence panel', 'fence post', 'timber fence'],
    environmentTerms: ['outdoor', 'backyard', 'residential'],
    positiveTerms: ['fence', 'timber', 'wooden', 'panel', 'post', 'outdoor', 'repair'],
    negativeTerms: ['tap', 'faucet', 'sink', 'plumbing', 'salon', 'office', 'bedroom', 'bicycle'],
    queries: [
      'handyman repairing wooden fence panel',
      'tradesperson fixing residential timber fence',
      'fence post repair outdoor',
      'wooden fence maintenance backyard',
    ],
  },
  'door repair': {
    canonicalCategory: 'repairs',
    subjectTerms: ['handyman', 'tradesperson'],
    actionTerms: ['repairing', 'fixing', 'adjusting'],
    objectTerms: ['interior door', 'door hinge', 'door handle', 'door frame'],
    environmentTerms: ['home interior', 'residential'],
    positiveTerms: ['door', 'hinge', 'handle', 'frame', 'repair', 'handyman'],
    negativeTerms: ['fire alarm', 'smoke detector', 'bicycle', 'chef', 'restaurant', 'kitchen stove'],
    queries: [
      'handyman repairing interior door hinge',
      'tradesperson fixing residential door handle',
      'door frame alignment repair home',
      'interior door maintenance handyman',
    ],
  },
  'deck maintenance': {
    canonicalCategory: 'outdoor',
    subjectTerms: ['handyman', 'carpenter'],
    actionTerms: ['maintaining', 'cleaning', 'restaining', 'repairing'],
    objectTerms: ['timber deck', 'wooden decking', 'outdoor deck boards'],
    environmentTerms: ['outdoor', 'backyard', 'patio'],
    positiveTerms: ['deck', 'decking', 'timber', 'wooden', 'outdoor', 'maintenance'],
    negativeTerms: ['doorway', 'interior architecture', 'ornamental door', 'salon', 'office'],
    queries: [
      'handyman maintaining timber deck',
      'wooden decking restoration outdoor',
      'deck board repair backyard',
      'outdoor timber deck maintenance',
    ],
  },
  'tile repair': {
    canonicalCategory: 'repairs',
    subjectTerms: ['tiler', 'handyman', 'tradesperson'],
    actionTerms: ['repairing', 'replacing', 'fixing'],
    objectTerms: ['floor tile', 'wall tile', 'ceramic tile', 'bathroom tile'],
    environmentTerms: ['bathroom', 'kitchen', 'home interior'],
    positiveTerms: ['tile', 'ceramic', 'grout', 'floor', 'wall', 'repair'],
    negativeTerms: ['office furniture', 'desk', 'chair', 'sofa', 'living room couch'],
    queries: [
      'tiler repairing floor tile grout',
      'handyman replacing broken ceramic tile',
      'bathroom tile repair tradesperson',
      'wall tile fix home interior',
    ],
  },
  'flyscreen repair': {
    canonicalCategory: 'repairs',
    subjectTerms: ['handyman', 'tradesperson'],
    actionTerms: ['repairing', 'replacing', 'rescreening'],
    objectTerms: ['window screen', 'flyscreen', 'mesh screen', 'screen door'],
    environmentTerms: ['home', 'window', 'doorway'],
    positiveTerms: ['flyscreen', 'window screen', 'mesh', 'screen door', 'repair'],
    negativeTerms: ['office meeting', 'conference', 'business meeting', 'restaurant', 'food'],
    queries: [
      'handyman repairing window flyscreen mesh',
      'rescreening window screen door',
      'flyscreen mesh replacement home',
      'window screen repair tradesperson',
    ],
  },
  'tv wall mounting': {
    canonicalCategory: 'assembly',
    subjectTerms: ['installer', 'handyman', 'technician'],
    actionTerms: ['mounting', 'installing', 'fitting'],
    objectTerms: ['television', 'TV', 'wall bracket', 'wall mount'],
    environmentTerms: ['living room', 'media wall', 'home interior'],
    positiveTerms: ['television', 'TV', 'wall mount', 'bracket', 'installer', 'living room'],
    negativeTerms: ['bed', 'bedroom only', 'plumbing', 'food', 'salon', 'fence'],
    queries: [
      'technician mounting television wall bracket',
      'handyman installing TV wall mount living room',
      'TV bracket installation home',
      'wall mounted television installer',
    ],
  },
  'cabinet installation': {
    canonicalCategory: 'assembly',
    subjectTerms: ['cabinet installer', 'handyman', 'carpenter'],
    actionTerms: ['installing', 'mounting', 'fitting'],
    objectTerms: ['kitchen cabinet', 'wall cabinet', 'cupboard', 'storage cabinet'],
    environmentTerms: ['kitchen', 'home interior'],
    positiveTerms: ['cabinet', 'cupboard', 'kitchen', 'install', 'mounting', 'storage'],
    negativeTerms: ['appliance unrelated', 'salon', 'office meeting', 'outdoor pipe'],
    queries: [
      'handyman installing kitchen wall cabinet',
      'cabinet installer mounting cupboard',
      'tradesperson fitting storage cabinets kitchen',
      'kitchen cabinet installation home',
    ],
  },
  'shelf installation': {
    canonicalCategory: 'assembly',
    subjectTerms: ['handyman', 'installer'],
    actionTerms: ['installing', 'mounting', 'fitting'],
    objectTerms: ['wall shelf', 'floating shelf', 'storage shelf', 'bookshelf'],
    environmentTerms: ['home interior', 'living room', 'bedroom'],
    positiveTerms: ['shelf', 'floating shelf', 'wall mount', 'install', 'storage'],
    negativeTerms: ['exterior pipe', 'plumbing pipe', 'outdoor gutter', 'salon'],
    queries: [
      'handyman installing floating wall shelf',
      'installer mounting storage shelf home',
      'wall shelf installation interior',
      'floating shelf mount tradesperson',
    ],
  },
  'gutter cleaning': {
    canonicalCategory: 'outdoor',
    subjectTerms: ['handyman', 'worker', 'tradesperson'],
    actionTerms: ['cleaning', 'clearing', 'removing leaves'],
    objectTerms: ['roof gutter', 'rain gutter', 'downpipe', 'gutter ladder'],
    environmentTerms: ['roofline', 'outdoor', 'residential'],
    positiveTerms: ['gutter', 'roof', 'ladder', 'leaves', 'downpipe', 'cleaning'],
    negativeTerms: ['salon', 'restaurant', 'beauty treatment', 'haircut', 'spa'],
    queries: [
      'worker cleaning roof gutter ladder',
      'handyman removing leaves from rain gutter',
      'residential gutter cleaning service',
      'roof gutter maintenance outdoor',
    ],
  },
  'window cleaning': {
    canonicalCategory: 'outdoor',
    subjectTerms: ['window cleaner', 'handyman'],
    actionTerms: ['cleaning', 'washing', 'polishing'],
    objectTerms: ['window glass', 'residential window', 'squeegee'],
    environmentTerms: ['home exterior', 'residential'],
    positiveTerms: ['window', 'cleaning', 'glass', 'squeegee', 'residential'],
    negativeTerms: ['salon', 'restaurant', 'office meeting'],
    queries: [
      'window cleaner washing residential windows',
      'handyman cleaning home window glass',
      'residential window cleaning squeegee',
      'exterior window wash service',
    ],
  },
  'pressure washing': {
    canonicalCategory: 'outdoor',
    subjectTerms: ['pressure washer', 'handyman', 'worker'],
    actionTerms: ['pressure washing', 'cleaning', 'spraying'],
    objectTerms: ['driveway', 'patio', 'exterior wall', 'deck'],
    environmentTerms: ['outdoor', 'residential'],
    positiveTerms: ['pressure wash', 'power wash', 'driveway', 'patio', 'exterior'],
    negativeTerms: ['salon', 'indoor office', 'bedroom'],
    queries: [
      'pressure washing residential driveway',
      'worker power washing patio outdoor',
      'exterior pressure cleaning home',
      'driveway pressure wash service',
    ],
  },
  'minor plumbing repairs': {
    canonicalCategory: 'repairs',
    subjectTerms: ['plumber', 'handyman'],
    actionTerms: ['repairing', 'fixing', 'replacing'],
    objectTerms: ['tap', 'faucet', 'sink', 'pipe leak', 'toilet'],
    environmentTerms: ['bathroom', 'kitchen', 'home'],
    positiveTerms: ['plumbing', 'tap', 'faucet', 'sink', 'pipe', 'leak', 'repair'],
    negativeTerms: ['fence', 'deck', 'salon', 'office meeting', 'television'],
    queries: [
      'plumber repairing kitchen tap leak',
      'handyman fixing bathroom faucet',
      'minor plumbing repair sink home',
      'residential pipe leak repair',
    ],
  },
  'minor electrical assistance': {
    canonicalCategory: 'repairs',
    subjectTerms: ['electrician', 'handyman'],
    actionTerms: ['installing', 'repairing', 'replacing', 'wiring'],
    objectTerms: ['light switch', 'power outlet', 'light fitting', 'electrical fixture'],
    environmentTerms: ['home interior', 'residential'],
    positiveTerms: ['electrical', 'electrician', 'outlet', 'switch', 'wiring', 'light'],
    negativeTerms: ['outdoor furniture', 'deck', 'salon', 'restaurant', 'fence'],
    queries: [
      'electrician installing light switch home',
      'handyman replacing power outlet',
      'residential electrical repair tradesperson',
      'light fitting installation interior',
    ],
  },
};

/**
 * @param {string} title
 */
export function canonicalizeServiceTitle(title) {
  let t = String(title ?? '').trim();
  if (!t) return '';

  const dashMatch = t.match(/^(.+?)\s[-–—]\s*(.+)$/);
  if (dashMatch) {
    const base = dashMatch[1].trim();
    const suffix = dashMatch[2].trim();
    if (
      SOURCE_SUFFIX_RE.test(` ${suffix}`) ||
      /^[A-Z][\w']+(?:'s)?$/i.test(suffix) ||
      /^(chef'?s?|house|branch|store|source)$/i.test(suffix)
    ) {
      t = base;
    }
  }

  return t.replace(SOURCE_SUFFIX_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} title
 */
export function normalizeServiceKey(title) {
  return canonicalizeServiceTitle(title).toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @param {string} title
 * @param {string} [category]
 */
export function buildCanonicalServiceKey(title, category = '') {
  return `${normalizeServiceKey(title)}:${String(category ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')}`;
}

/**
 * Derive intent for professional / finance / legal consultation titles.
 * Never inject handyman/trades queries (those produce truck/worker stock photos).
 * @param {string} canonicalTitle
 */
function deriveProfessionalIntentFromTitle(canonicalTitle) {
  const title = canonicalTitle || 'professional consultation';
  return {
    canonicalCategory: 'professional_consultation',
    subjectTerms: ['advisor', 'consultant', 'professional', 'client'],
    actionTerms: ['meeting', 'advising', 'planning'],
    objectTerms: ['documents', 'charts', 'planning'],
    environmentTerms: ['office', 'meeting room', 'boardroom'],
    positiveTerms: [
      'office',
      'consultation',
      'advisor',
      'finance',
      'professional',
      'meeting',
      'client',
    ],
    negativeTerms: [
      'handyman',
      'tradesperson',
      'truck',
      'sanitation',
      'garbage',
      'pressure wash',
      'plumber',
      'fence',
      'gutter',
      'toolbox',
      'construction site',
      'high visibility vest',
    ],
    queries: [
      `${title} professional office consultation`,
      'financial advisor client meeting modern office',
      'professional consultation meeting modern office',
      'business advisor reviewing documents office',
    ],
  };
}

/**
 * @param {object} input
 */
function isProfessionalServiceImageContext(input = {}) {
  const slug = String(input.businessSubcategory ?? input.verticalSlug ?? '').toLowerCase();
  const cat = String(input.businessCategory ?? input.businessType ?? '').toLowerCase();
  const name = String(input.serviceName ?? '').toLowerCase();
  if (/^services\.(finance|accounting|legal)/.test(slug)) return true;
  if (/\b(finance|financial|capital|accounting|lawyer|legal|solicitor|advisory|consult)/.test(`${slug} ${cat}`)) {
    return true;
  }
  if (/book our consultations|consultation|refinance|home loan|mortgage/.test(name)) return true;
  return false;
}

/**
 * Derive intent fields from title when no profile exists.
 * @param {string} canonicalTitle
 */
function deriveIntentFromTitle(canonicalTitle) {
  const lower = canonicalTitle.toLowerCase();
  const tokens = lower.split(/\s+/).filter(Boolean);
  const actionTerms = [];
  const objectTerms = [];
  const positiveTerms = [...tokens];
  const negativeTerms = ['salon', 'restaurant', 'office meeting', 'bakery', 'cafe'];

  for (const verb of ['repair', 'install', 'mount', 'clean', 'maintain', 'replace', 'fix', 'paint']) {
    if (lower.includes(verb)) actionTerms.push(`${verb}ing`, verb);
  }
  objectTerms.push(...tokens.filter((t) => !GENERIC_QUERY_TERMS.has(t)));

  const queries = [
    `handyman ${tokens.slice(0, 4).join(' ')} service`,
    `tradesperson ${objectTerms.slice(0, 3).join(' ')} ${actionTerms[0] || 'working'}`,
    `${canonicalTitle} professional service photo`,
  ].filter((q) => q.replace(/\s+/g, ' ').trim().length > 8);

  return {
    canonicalCategory: 'general_service',
    subjectTerms: ['handyman', 'tradesperson', 'professional'],
    actionTerms: actionTerms.length ? actionTerms : ['servicing'],
    objectTerms: objectTerms.length ? objectTerms : tokens,
    environmentTerms: ['residential', 'home'],
    positiveTerms,
    negativeTerms,
    queries,
  };
}

/**
 * @param {object} input
 * @returns {ServiceImageIntent}
 */
export function buildServiceImageIntent(input = {}) {
  const originalTitle = String(input.serviceName ?? '').trim();
  const canonicalTitle = canonicalizeServiceTitle(originalTitle) || originalTitle;
  const key = normalizeServiceKey(canonicalTitle);
  const professional = isProfessionalServiceImageContext(input);
  const profile =
    SERVICE_INTENT_PROFILES[key] ??
    (professional ? deriveProfessionalIntentFromTitle(canonicalTitle) : deriveIntentFromTitle(canonicalTitle));

  let blueprintHint = null;
  if (input.imageQueryHint) {
    blueprintHint = String(input.imageQueryHint).trim();
  } else {
    try {
      blueprintHint = resolveBlueprintItemImageHint(canonicalTitle, {
        storeName: input.businessCategory,
        verticalSlug: input.businessSubcategory ?? input.businessCategory,
        businessType: input.businessCategory,
      });
    } catch {
      blueprintHint = null;
    }
  }

  const queries = [];
  const pushQuery = (q) => {
    const t = String(q ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!t || queries.includes(t)) return;
    if ([...GENERIC_QUERY_TERMS].every((g) => t === g || t.split(/\s+/).length <= 2)) return;
    queries.push(t);
  };

  if (blueprintHint) pushQuery(blueprintHint);
  for (const q of profile.queries ?? []) pushQuery(q);
  // Do not merge handyman deriveIntent queries for professional/finance titles.
  if (!professional) {
    for (const q of deriveIntentFromTitle(canonicalTitle).queries ?? []) pushQuery(q);
  }

  if (!queries.length) {
    pushQuery(
      professional
        ? `professional consultation meeting modern office`
        : `handyman ${canonicalTitle.toLowerCase()} service professional`,
    );
  }

  /** @type {ServiceImageIntent} */
  return {
    originalTitle,
    canonicalTitle,
    canonicalCategory: profile.canonicalCategory ?? 'general_service',
    subjectTerms: profile.subjectTerms ?? [],
    actionTerms: profile.actionTerms ?? [],
    objectTerms: profile.objectTerms ?? [],
    environmentTerms: profile.environmentTerms ?? [],
    positiveTerms: profile.positiveTerms ?? [],
    negativeTerms: profile.negativeTerms ?? [],
    queries: queries.slice(0, 4),
  };
}

/**
 * Business context sufficiency gate — D7.1.
 * Determines whether Cardbey knows enough about what the business does
 * before FULL analysis. Triggers at most one clarification question.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { BUSINESS_CONTEXT_MODES } from './types.js';

/** Labels too broad to support useful downstream analysis on their own. */
const GENERIC_LABELS = new Set([
  'service',
  'services',
  'consulting',
  'consultancy',
  'shop',
  'store',
  'business',
  'company',
  'online business',
  'technology company',
  'tech company',
  'manufacturing',
  'business services',
  'professional services',
  'general business',
  'startup',
  'enterprise',
  'solution',
  'solutions',
  'agency',
  'firm',
]);

const GENERIC_PATTERNS = [
  /^online\s+business$/i,
  /^technology\s+compan(y|ies)$/i,
  /^business\s+services?$/i,
  /^professional\s+services?$/i,
  /^general\s+business$/i,
  /^a\s+service$/i,
  /^create\s+a\s+service$/i,
];

/**
 * @param {string | null | undefined} label
 */
export function isGenericBusinessLabel(label) {
  const n = normalizeLabel(label);
  if (!n) return true;
  if (GENERIC_LABELS.has(n)) return true;
  if (GENERIC_PATTERNS.some((re) => re.test(n))) return true;
  // Single generic token
  if (n.split(/\s+/).length === 1 && GENERIC_LABELS.has(n.split(/\s+/)[0])) return true;
  return false;
}

function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 */
export function hasTypeClarification(ctx) {
  return (ctx.knowledge || []).some(
    (k) => k.field === 'typeClarificationAnswer' && k.knowledgeState === KNOWLEDGE_STATES.USER_DEFINED,
  );
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 */
function resolvedCategoryIsSpecific(ctx) {
  const slug = ctx.identity?.verticalSlug || knowledgeValue(ctx, 'verticalSlug');
  const category = ctx.identity?.category || knowledgeValue(ctx, 'category');
  if (slug && slug !== 'services.general' && !String(slug).endsWith('.general')) return true;
  if (category && !isGenericBusinessLabel(category)) {
    const cat = normalizeLabel(category);
    if (cat !== 'professional services' && cat !== 'general business') return true;
  }
  return false;
}

function knowledgeValue(ctx, field) {
  const item = (ctx.knowledge || []).find((k) => k.field === field);
  return item?.value != null ? String(item.value) : null;
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 * @returns {{
 *   sufficient: boolean,
 *   reason?: string,
 *   genericFields?: string[],
 *   question?: string,
 *   clarificationKey?: string,
 * }}
 */
export function assessBusinessContextSufficiency(ctx) {
  if (!ctx?.mode) {
    return { sufficient: false, reason: 'mode_missing' };
  }

  if (hasTypeClarification(ctx)) {
    return { sufficient: true };
  }

  const name = ctx.identity?.name || null;
  const businessType = ctx.identity?.businessType || null;
  const sourceText = ctx.sourceText || '';

  const nameGeneric = isGenericBusinessLabel(name);
  const typeGeneric = isGenericBusinessLabel(businessType);
  const nameEchoesType =
    name &&
    businessType &&
    normalizeLabel(name) === normalizeLabel(businessType);
  const nameIsSpecificBrand =
    name &&
    !nameGeneric &&
    normalizeLabel(name).split(/\s+/).filter(Boolean).length >= 2;

  // Parser echoed brand into businessType — not a generic-input problem
  if (nameEchoesType && nameIsSpecificBrand) {
    return { sufficient: true, reason: 'brand_name_carries_specificity' };
  }

  // EXISTING: multi-token brand name is sufficient even before category refinement
  if (ctx.mode === BUSINESS_CONTEXT_MODES.EXISTING && name && !nameGeneric && !nameEchoesType) {
    const tokens = normalizeLabel(name).split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      return { sufficient: true, reason: 'existing_named_business' };
    }
  }

  // EXISTING: Places-resolved + specific category → sufficient
  if (ctx.mode === BUSINESS_CONTEXT_MODES.EXISTING) {
    const placesMatched =
      ctx.resolution?.status === 'matched' && Boolean(ctx.resolution?.selectedEntityId);
    const hasSpecificName = name && !nameGeneric && !nameEchoesType;
    if (placesMatched && (resolvedCategoryIsSpecific(ctx) || hasSpecificName)) {
      return { sufficient: true, reason: 'existing_places_specific' };
    }
    if (hasSpecificName && businessType && !typeGeneric && !nameEchoesType) {
      return { sufficient: true, reason: 'existing_specific_identity' };
    }
  }

  // Rich source text can carry specificity even when parsed name/type is generic
  const sourceSpecificity = scoreSourceTextSpecificity(sourceText);
  if (sourceSpecificity >= 0.65 && !typeGeneric) {
    return { sufficient: true, reason: 'source_text_specific' };
  }
  if (sourceSpecificity >= 0.45 && String(sourceText || '').split(/\s+/).length >= 7) {
    return { sufficient: true, reason: 'source_text_descriptive' };
  }
  if (sourceSpecificity >= 0.75 && (nameGeneric || typeGeneric)) {
    // e.g. long description with concrete offerings — still sufficient if type parse failed
    return { sufficient: true, reason: 'source_text_rich' };
  }

  const genericFields = [];
  if (nameGeneric || nameEchoesType) genericFields.push('name');
  if (typeGeneric || !businessType) genericFields.push('businessType');

  if (!genericFields.length && businessType && name) {
    return { sufficient: true };
  }

  // Only clarify when materially affects analysis
  if (genericFields.length === 0) {
    return { sufficient: true };
  }

  const question = buildClarificationQuestion(ctx);
  return {
    sufficient: false,
    reason: 'generic_identity_or_type',
    genericFields,
    question,
    clarificationKey: 'business_type_specificity',
  };
}

/**
 * Score 0–1 how specific the raw user text is about what the business does.
 * @param {string} text
 */
function scoreSourceTextSpecificity(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return 0;
  let score = 0;
  const specificNouns = [
    'bookkeeping',
    'bas',
    'detailing',
    'plumbing',
    'restaurant',
    'bakery',
    'tutoring',
    'grooming',
    'photography',
    'manufacturing',
    'packaging',
    'accounting',
    'cleaning',
    'consulting',
    'software',
    'saas',
    'clinic',
    'dental',
    'gym',
    'fitness',
    'wedding',
    'real estate',
    'childcare',
    'hydroponic',
    'coffee',
    'matcha',
    'drone',
    'modular',
    'fleet',
    'aged-care',
    'lacquerware',
    'bootcamp',
    'coding',
    'nanny',
    'export',
    'gin',
    'distillery',
    'garden',
    'electrical',
    'physio',
    'cybersecurity',
    'ceramic',
    'skincare',
    'scheduling',
  ];
  for (const n of specificNouns) {
    if (t.includes(n)) score += 0.15;
  }
  if (/\b(mobile|online|b2b|wholesale|custom|specialty)\b/.test(t)) score += 0.1;
  if (t.split(/\s+/).length >= 8) score += 0.1;
  return Math.min(1, score);
}

/**
 * @param {import('./types.js').BusinessContext} ctx
 */
function buildClarificationQuestion(ctx) {
  const mode = ctx.mode;
  const typeHint = normalizeLabel(ctx.identity?.businessType || '');
  const source = String(ctx.sourceText || '').toLowerCase();

  if (/\b(manufactur|factory|produce|packaging)\b/.test(source) || typeHint.includes('manufactur')) {
    return 'What products do you manufacture or supply?';
  }
  if (/\b(restaurant|cafe|food|menu|bakery|hospitality)\b/.test(source)) {
    return 'What kind of food or hospitality business is this?';
  }
  if (/\b(shop|store|retail|boutique|ecommerce|online)\b/.test(source)) {
    return 'What products do you sell or plan to sell?';
  }
  if (/\b(software|saas|app|platform|tech)\b/.test(source)) {
    return 'What does this software or technology help customers do?';
  }
  if (mode === BUSINESS_CONTEXT_MODES.INTENDED) {
    return 'What kind of service or product would this business provide?';
  }
  return 'What kind of service or product does this business provide?';
}

export { GENERIC_LABELS, normalizeLabel };

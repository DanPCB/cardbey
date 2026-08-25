/**
 * Build comparison discovery queries from BusinessContext — D7.1.
 * Vertical packs enrich; they are not prerequisites for search.
 */

import { isGenericBusinessLabel, normalizeLabel } from './businessContextSufficiency.js';
import { VERTICAL_ARCHETYPES } from './verticalPacks.js';

const STOP = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'want',
  'create',
  'start',
  'open',
  'planning',
  'business',
  'company',
  'service',
  'services',
  'australian',
  'australia',
  'vietnam',
  'melbourne',
  'sydney',
  'brisbane',
  'perth',
  'adelaide',
  'canberra',
  'hobart',
  'darwin',
  'richmond',
  'vietnamese',
  'existing',
  'operate',
]);

/**
 * @param {{
 *   businessName?: string | null,
 *   businessType?: string | null,
 *   category?: string | null,
 *   location?: string | null,
 *   sourceText?: string | null,
 *   operatingModel?: string | null,
 *   offerings?: string[],
 *   verticalId?: string | null,
 *   typeClarificationAnswer?: string | null,
 * }} input
 * @returns {string[]}
 */
export function buildComparisonSearchQueries(input) {
  const queries = new Set();
  const location = clean(input.location);
  const verticalId = input.verticalId || null;

  const typeHint = effectiveTypeHint(input);
  const category = clean(input.category);

  if (typeHint && location) {
    queries.add(`${typeHint} ${location}`);
  }
  if (category && !isGenericBusinessLabel(category) && location) {
    queries.add(`${category} ${location}`);
  }

  // Clarification answer often carries the real specificity
  const clarification = clean(input.typeClarificationAnswer);
  if (clarification && location) {
    queries.add(`${clarification} ${location}`);
    const short = clarification.split(/\s+/).slice(0, 4).join(' ');
    if (short.length > 4) queries.add(`${short} ${location}`);
  }

  // Source-text derived concepts (not conclusions)
  for (const concept of extractSearchConcepts(input.sourceText, input.offerings)) {
    if (location) queries.add(`${concept} ${location}`);
    else queries.add(concept);
  }

  // Vertical pack seeds (enrichment only)
  if (verticalId && verticalId !== VERTICAL_ARCHETYPES.GENERAL) {
    const packQueries = verticalPackQueries(verticalId, location);
    for (const q of packQueries) queries.add(q);
  }

  // Offering-led queries
  for (const offering of (input.offerings || []).slice(0, 3)) {
    const o = clean(offering);
    if (!o || o.length < 4) continue;
    if (location) queries.add(`${o} ${location}`);
  }

  return [...queries].filter(Boolean).slice(0, 6);
}

function effectiveTypeHint(input) {
  const clarification = clean(input.typeClarificationAnswer);
  if (clarification && !isGenericBusinessLabel(clarification)) {
    return clarification.slice(0, 80);
  }

  const businessType = clean(input.businessType);
  const name = clean(input.businessName);

  if (businessType && !isGenericBusinessLabel(businessType)) {
    if (name && normalizeLabel(name) === normalizeLabel(businessType)) {
      // Name-echo — prefer source-derived hint
      const fromSource = extractPrimaryConcept(input.sourceText);
      if (fromSource) return fromSource;
    }
    return businessType;
  }

  const fromSource = extractPrimaryConcept(input.sourceText);
  if (fromSource) return fromSource;

  if (name && !isGenericBusinessLabel(name)) return name;
  return businessType;
}

/**
 * @param {string | null | undefined} sourceText
 * @param {string[]} [offerings]
 */
function extractSearchConcepts(sourceText, offerings = []) {
  const concepts = new Set();
  const primary = extractPrimaryConcept(sourceText);
  if (primary) concepts.add(primary);

  const t = String(sourceText || '').toLowerCase();
  const patterns = [
    /\b(mobile\s+\w+(?:\s+\w+){0,2})/g,
    /\b(custom\s+\w+(?:\s+\w+){0,2})/g,
    /\b(\w+\s+(?:service|services|shop|store|studio|salon|clinic|agency|manufacturer|supplies))\b/g,
    /\b(\w+\s+\w+\s+(?:business|company|startup))\b/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(t)) !== null) {
      const phrase = clean(m[1]);
      if (phrase && phrase.length > 5 && !isGenericBusinessLabel(phrase)) {
        concepts.add(titleCase(phrase));
      }
    }
  }

  for (const o of offerings.slice(0, 2)) {
    if (o && o.length > 4) concepts.add(String(o));
  }

  return [...concepts].slice(0, 4);
}

function extractPrimaryConcept(sourceText) {
  const t = String(sourceText || '')
    .replace(/\b(i\s+want\s+to|i'?m\s+planning|i\s+run|i\s+own|create|start|open|launch)\b/gi, ' ')
    .replace(/\b(in|at|near|for|around)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Prefer longest meaningful phrase before stripping generic tails
  const withoutGenericTail = t
    .replace(/\b(service|services|business|company|shop|store)\s*$/i, '')
    .trim();

  const candidate = withoutGenericTail || t;
  const tokens = candidate
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  if (tokens.length >= 2) {
    const phrase = tokens.slice(0, 5).join(' ');
    if (!isGenericBusinessLabel(phrase)) return titleCase(phrase);
  }
  return null;
}

function verticalPackQueries(verticalId, location) {
  const map = {
    [VERTICAL_ARCHETYPES.LOCAL_SERVICE]: ['home services', 'trade services', 'local services'],
    [VERTICAL_ARCHETYPES.PROFESSIONAL_SERVICE]: ['professional services', 'business services'],
    [VERTICAL_ARCHETYPES.HOSPITALITY]: ['restaurant', 'cafe', 'food'],
    [VERTICAL_ARCHETYPES.PRODUCT_RETAIL]: ['retail store', 'boutique'],
    [VERTICAL_ARCHETYPES.MANUFACTURING_B2B]: ['manufacturing', 'wholesale supplier'],
  };
  const seeds = map[verticalId] || [];
  if (!location) return seeds;
  return seeds.map((s) => `${s} ${location}`);
}

function clean(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

function titleCase(s) {
  return String(s)
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

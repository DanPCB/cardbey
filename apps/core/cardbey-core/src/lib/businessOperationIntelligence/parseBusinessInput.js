/**
 * Natural-language parse + mode inference for Business Context Phase A.
 * Heuristic only — does not invent businesses or websites.
 */

import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { BUSINESS_CONTEXT_MODES, createKnowledgeItem } from './types.js';

const INTENDED_RE =
  /\b(i\s+want\s+to\s+(start|create|open|launch|build|begin)|i'?m\s+planning|i\s+am\s+planning|planning\s+to\s+(start|open|create|launch)|looking\s+to\s+(start|open|create|launch)|want\s+to\s+(start|create|open|launch)|business\s+idea|exploring\s+(a\s+)?(new\s+)?business|thinking\s+(of|about)\s+(starting|opening|creating))\b/i;

const EXISTING_RE =
  /\b(i\s+run|i\s+own|i\s+operate|we\s+run|we\s+own|we\s+operate|my\s+(existing\s+)?business|our\s+(existing\s+)?business|i\s+have\s+a\s+business|existing\s+business)\b/i;

const LOCATION_IN_RE =
  /\b(?:in|at|near|around|based\s+in|located\s+in)\s+([A-Z][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Z][A-Za-zÀ-ÿ.']*){0,4}(?:,\s*[A-Z][A-Za-zÀ-ÿ.']+){0,2})/i;

const WEBSITE_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]+\.[a-z]{2,}(?:\/[^\s]*)?)/i;

const OPERATING_MODEL_RULES = [
  { re: /\bmobile\b/i, label: 'Mobile service business' },
  { re: /\b(online|saas|software|digital|app-based|ai\s+service)\b/i, label: 'Digital / software service' },
  { re: /\b(manufactur|fabricat|producti)\w*\b/i, label: 'Manufacturing business' },
  { re: /\b(installat|install)\w*\b/i, label: 'Installation service' },
  { re: /\b(brick[\s-]?and[\s-]?mortar|storefront|shopfront|physical\s+store)\b/i, label: 'Physical storefront' },
  { re: /\b(home[\s-]?based|from\s+home)\b/i, label: 'Home-based business' },
];

const TYPE_PHRASE_RE =
  /\b((?:vietnamese|italian|thai|chinese|indian|mexican|modern|custom|mobile|ai)?\s*(?:restaurant|cafe|café|bakery|salon|barber|plumbing|plumber|detailing|accounting|security\s+doors?|packaging|manufacturing|installation|consulting|agency|clinic|gym|boutique|shop|store|service|services|company|business)(?:\s+(?:and|&)\s+\w+){0,3})/i;

/**
 * @param {string | null | undefined} value
 */
function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text
 * @returns {'EXISTING' | 'INTENDED' | null}
 */
export function inferModeFromText(text) {
  const t = clean(text);
  if (!t) return null;
  const intended = INTENDED_RE.test(t);
  const existing = EXISTING_RE.test(t);
  if (intended && !existing) return BUSINESS_CONTEXT_MODES.INTENDED;
  if (existing && !intended) return BUSINESS_CONTEXT_MODES.EXISTING;
  if (intended && existing) return null;
  return null;
}

/**
 * Named-business heuristic: Title-ish tokens without strong intent verbs.
 * e.g. "Modern Security Doors Melbourne", "ABC Plumbing Melbourne"
 * @param {string} text
 */
export function looksLikeNamedExistingBusiness(text) {
  const t = clean(text);
  if (!t || INTENDED_RE.test(t) || EXISTING_RE.test(t)) return false;
  if (t.split(/\s+/).length < 2) return false;
  // First token capitalized / acronym-like and not a common type-only opener
  const first = t.split(/\s+/)[0];
  if (!/^[A-Z0-9]/.test(first)) return false;
  const typeOnly =
    /^(vietnamese|italian|thai|chinese|indian|mexican|mobile|custom|modern)\s+(restaurant|cafe|café|detailing|packaging)/i.test(
      t,
    );
  if (typeOnly && !/\b(pty|ltd|inc|llc|co\.|company|doors|plumbing|salon)\b/i.test(t)) {
    // "Vietnamese restaurant in Richmond" — type + place, not a trade name
    return false;
  }
  // Has at least two capitalized words OR a known brand-like pattern
  const caps = t.match(/\b[A-Z][a-zA-Z0-9&'-]+\b/g) || [];
  return caps.length >= 2 || /\b(doors|plumbing|security|detailing)\b/i.test(t);
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function extractLocation(text) {
  const t = clean(text);
  if (!t) return null;
  const m = t.match(LOCATION_IN_RE);
  if (m?.[1]) return clean(m[1].replace(/[.!?]+$/, ''));

  // Trailing city/region: "Modern Security Doors Melbourne"
  const trailing = t.match(
    /\b(Melbourne|Sydney|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin|Richmond|Ho Chi Minh City|Hanoi|HCMC|Victoria|NSW|Queensland|Australia|Vietnam)\b\s*$/i,
  );
  if (trailing) return trailing[1];

  const mid = t.match(
    /\b(Melbourne|Sydney|Brisbane|Perth|Adelaide|Richmond|Ho Chi Minh City|Hanoi)\b/i,
  );
  return mid ? mid[1] : null;
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function extractWebsite(text) {
  const m = clean(text).match(WEBSITE_RE);
  if (!m?.[1]) return null;
  let url = m[1];
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function extractOperatingModel(text) {
  for (const rule of OPERATING_MODEL_RULES) {
    if (rule.re.test(text)) return rule.label;
  }
  return null;
}

/**
 * @param {string} text
 * @param {string | null} location
 * @returns {string | null}
 */
export function extractLikelyName(text, location) {
  let t = clean(text);
  if (!t) return null;

  t = t
    .replace(INTENDED_RE, ' ')
    .replace(EXISTING_RE, ' ')
    .replace(/\b(a|an|the|for|australian|smes?)\b/gi, ' ')
    .replace(LOCATION_IN_RE, ' ')
    .replace(WEBSITE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (location) {
    const locRe = new RegExp(`\\b${escapeRegExp(location)}\\b`, 'ig');
    t = t.replace(locRe, ' ').replace(/\s+/g, ' ').trim();
  }

  // Strip leading filler
  t = t.replace(/^(run|own|operate|start|create|open|launch|build)\s+/i, '').trim();

  if (!t || t.length < 2) return null;

  // Prefer type phrase for intended concepts as display name when no brand
  if (INTENDED_RE.test(clean(text)) || !looksLikeNamedExistingBusiness(clean(text))) {
    const typeM = clean(text).match(TYPE_PHRASE_RE);
    if (typeM?.[1]) {
      return titleCase(clean(typeM[1]));
    }
  }

  // Named business: take leading tokens before location residual
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const nameTokens = tokens.slice(0, Math.min(6, tokens.length));
  return titleCase(nameTokens.join(' '));
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function extractBusinessType(text) {
  const m = clean(text).match(TYPE_PHRASE_RE);
  if (m?.[1]) return titleCase(clean(m[1]));

  const operating = extractOperatingModel(text);
  if (operating) return operating;

  // Soft fallback from keywords
  if (/\bsecurity\s+doors?\b/i.test(text)) return 'Security doors';
  if (/\bcar\s+detail/i.test(text)) return 'Mobile car detailing';
  if (/\bpackaging\b/i.test(text)) return 'Custom packaging';
  if (/\baccounting\b/i.test(text)) return 'Accounting service';
  return null;
}

/**
 * @param {string} text
 * @param {{ modeHint?: 'EXISTING' | 'INTENDED' | null }} [opts]
 */
export function parseBusinessInput(text, opts = {}) {
  const sourceText = clean(text);
  /** @type {import('./types.js').KnowledgeItem[]} */
  const knowledge = [];

  if (!sourceText) {
    return {
      sourceText: '',
      mode: null,
      modeConfidence: 0,
      needsModeClarification: true,
      name: null,
      businessType: null,
      category: null,
      location: null,
      website: null,
      operatingModel: null,
      knowledge: [],
      missingCritical: ['description'],
    };
  }

  knowledge.push(
    createKnowledgeItem({
      field: 'sourceText',
      value: sourceText,
      knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
      source: 'user_prompt',
      confidence: 1,
    }),
  );

  let mode = opts.modeHint === 'EXISTING' || opts.modeHint === 'INTENDED' ? opts.modeHint : null;
  let modeConfidence = mode ? 1 : 0;
  let needsModeClarification = false;

  if (!mode) {
    const inferred = inferModeFromText(sourceText);
    if (inferred) {
      mode = inferred;
      modeConfidence = 0.9;
    } else if (looksLikeNamedExistingBusiness(sourceText)) {
      mode = BUSINESS_CONTEXT_MODES.EXISTING;
      modeConfidence = 0.75;
    } else {
      // Type + location alone is ambiguous (could be idea or search)
      needsModeClarification = true;
      modeConfidence = 0;
    }
  }

  if (mode) {
    knowledge.push(
      createKnowledgeItem({
        field: 'mode',
        value: mode,
        knowledgeState:
          opts.modeHint != null ? KNOWLEDGE_STATES.USER_DEFINED : KNOWLEDGE_STATES.AI_INFERENCE,
        source: opts.modeHint != null ? 'user_mode_hint' : 'mode_inference',
        confidence: modeConfidence,
      }),
    );
  }

  const location = extractLocation(sourceText);
  if (location) {
    knowledge.push(
      createKnowledgeItem({
        field: 'location',
        value: location,
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        source: 'user_prompt',
        confidence: 0.85,
      }),
    );
  }

  const website = extractWebsite(sourceText);
  if (website) {
    knowledge.push(
      createKnowledgeItem({
        field: 'website',
        value: website,
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        source: 'user_prompt',
        confidence: 0.9,
      }),
    );
  }

  const operatingModel = extractOperatingModel(sourceText);
  if (operatingModel) {
    knowledge.push(
      createKnowledgeItem({
        field: 'operatingModel',
        value: operatingModel,
        knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
        source: 'user_prompt',
        confidence: 0.8,
      }),
    );
  }

  const businessType = extractBusinessType(sourceText);
  if (businessType) {
    knowledge.push(
      createKnowledgeItem({
        field: 'businessType',
        value: businessType,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        source: 'nl_parse',
        confidence: 0.7,
      }),
    );
  }

  const name = extractLikelyName(sourceText, location);
  if (name) {
    knowledge.push(
      createKnowledgeItem({
        field: 'name',
        value: name,
        knowledgeState: KNOWLEDGE_STATES.AI_INFERENCE,
        source: 'nl_parse',
        confidence: mode === BUSINESS_CONTEXT_MODES.EXISTING ? 0.75 : 0.65,
        note: 'Derived from prompt — refined by Places when available',
      }),
    );
  }

  const missingCritical = [];
  if (!mode && needsModeClarification) missingCritical.push('mode');
  if (!businessType && !name) missingCritical.push('businessType');
  if (!location) missingCritical.push('location');

  return {
    sourceText,
    mode,
    modeConfidence,
    needsModeClarification,
    name,
    businessType,
    category: null,
    location,
    website,
    operatingModel,
    knowledge,
    missingCritical,
  };
}

/**
 * @param {string} s
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} s
 */
function titleCase(s) {
  return clean(s)
    .split(/\s+/)
    .map((w) => {
      if (/^[A-Z0-9]{2,}$/.test(w)) return w;
      if (/^(and|&|of|for|the|a|an)$/i.test(w)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

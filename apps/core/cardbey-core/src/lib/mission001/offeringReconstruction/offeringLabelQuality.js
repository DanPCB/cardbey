/**
 * Shared offering-label quality gates.
 * Prefer SPARSE over nav chrome / marketing fiction.
 */

/** Exact or near-exact chrome / editorial / account labels — never offerings. */
export const NON_OFFERING_LABEL_RE =
  /^(home|about(\s+us)?|contact(\s+us)?|gallery|blog|news|press(\s+room)?|careers?|jobs?|login|log\s*in|sign[\s-]?in|sign[\s-]?up|register|my\s+account|account|search|cart|bag|checkout|wishlist|privacy(\s+policy)?|terms(\s+(&|and)\s+conditions)?|cookie(s)?|faq|help|support|warranty|hotline|follow\s+us|instagram|facebook|youtube|linkedin|twitter|tiktok|newsletter|subscribe|unsubscribe|read\s+more|learn\s+more|click\s+here|see\s+all|view\s+all|shop\s+all|shop\s+by(\s+\w+)?|continue\s+shopping|back\s+to\s+top|who\s+we\s+are|our\s+people|our\s+team|meet\s+the\s+team|overview|purpose(\s+values?)?|governance|leadership|locations?|find\s+a\s+store|store\s+locator|journal|insights|resources|media|awards?|testimonials?|reviews?|why\s+choose\s+us|new\s+in|coming\s+soon|all\s+brands(\s+a-z)?|solutions?\s+to\s+know|brew\s+guide|vanguard\s+logo|logo|recognition|press\s+room|what\s+we\s+believe(\s+in)?|future\s+vision|social\s+responsibility|our\s+purpose|our\s+values|diversity|inclusion|sustainability|alumni|global\s+office|offices|secondary\s+navigation(\s+menu)?(\s*\(mobile\))?|primary\s+navigation(\s+menu)?|skip\s+to\s+(content|main)|shop\s+typo)$/i;

/** Soft chrome / promo / truncated page chrome — reject even when not exact. */
export const NON_OFFERING_SOFT_RE =
  /\b(blog|news|careers?|jobs?|privacy|terms|cookie|login|sign[\s-]?in|cart|checkout|follow\s+us|instagram|facebook|linkedin|youtube|read\s+more|learn\s+more|click\s+here|subscribe|newsletter|awards?|testimonials?|why\s+choose\s+us|our\s+team|meet\s+the\s+team|vacancies|shop\s+by\s+|see\s+all|view\s+all|shop\s+all|continue\s+shopping|who\s+we\s+are|our\s+people|my\s+account|selected\s*$|,\s*selected|spend\s*$|logo\b|%\s*off\b|off\s+selected|for\s+\$?\d+\b|press\s+room|social\s+responsibility|future\s+vision|what\s+we\s+believe|recognition|navigation\s+menu|free\s+delivery|buy\s+\d+\s+get|what\s+.+\?\s*$)\b/i;

const GENERIC_ONLY_RE =
  /^(products?|services?|solutions?|collections?|menu|shop|range|offerings?|capabilities?|industries|sectors|sản phẩm)$/i;

const PROMO_ONLY_RE =
  /^(\d+\s*for(\s+\d+)?|\d+%\s*off|\$\d+(\.\d{2})?\s*(off|sale)|free\s+shipping|sale|clearance)$/i;

/** Positive commercial ontology signals in a label. */
export const COMMERCIAL_SIGNAL_RE =
  /\b(product|products|service|services|solution|solutions|treatment|treatments|menu|package|packages|collection|collections|investment|investments|superannuation|audit|assurance|tax|advisory|consulting|door|doors|shutter|shutters|screen|coffee|roaster|wholesale|subscription|subscriptions|class|classes|equipment|shop|buy|book|install|installation|repair|support|care|clothing|tops?|tanks?|shirts?|jeans|dresses|beauty|makeup|skincare|fragrance|haircare|nail|flowers?|print|prints|vessel|milk|yogurt|insurance|advice|adviser|financial|institutional|workers?|disability|ndis|security|window|windows|blind|blinds|curtain|fly|roller|glass|hinged|sliding|custom|capability|engagement|practice|industry|sector)\b/i;

/**
 * @param {string} name
 * @returns {{ ok: boolean, reason?: string }}
 */
export function evaluateOfferingLabel(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!n || n.length < 3) return { ok: false, reason: 'length' };
  if (n.length > 90) return { ok: false, reason: 'length' };
  if (!/[a-zA-Z\u00C0-\u024F]/u.test(n)) return { ok: false, reason: 'no_letters' };
  if (/^\d+$/.test(n)) return { ok: false, reason: 'numeric_only' };
  if (NON_OFFERING_LABEL_RE.test(n)) return { ok: false, reason: 'non_commercial_label' };
  if (NON_OFFERING_SOFT_RE.test(n)) return { ok: false, reason: 'non_commercial_label' };
  if (GENERIC_ONLY_RE.test(n)) return { ok: false, reason: 'generic_nav_label' };
  if (PROMO_ONLY_RE.test(n)) return { ok: false, reason: 'promo_chrome' };
  // Truncated page-title fragments (e.g. "... Melbourne Spend")
  if (/\|\s*.{0,40}$/.test(n) && n.length > 40) return { ok: false, reason: 'page_title_fragment' };
  if (/\b(spend|selected)\s*$/i.test(n)) return { ok: false, reason: 'page_title_fragment' };
  // Emoji-only marketing collabs without product nouns
  if (/[\u{1F300}-\u{1FAFF}]/u.test(n) && !COMMERCIAL_SIGNAL_RE.test(n)) {
    return { ok: false, reason: 'promo_chrome' };
  }
  // FAQ / marketing questions are not offerings
  if (/\?\s*$/.test(n)) return { ok: false, reason: 'promo_chrome' };
  return { ok: true };
}

/**
 * @param {Array<{ name?: string }>} items
 */
export function filterCatalogItemsByOfferingLabel(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => evaluateOfferingLabel(item?.name).ok);
}

/**
 * True when a catalog looks dominated by chrome rather than offerings.
 * @param {Array<{ name?: string }>} items
 */
export function catalogLooksLikeNavChrome(items) {
  if (!Array.isArray(items) || !items.length) return true;
  const bad = items.filter((item) => !evaluateOfferingLabel(item?.name).ok).length;
  if (bad / items.length >= 0.35) return true;
  const withSignal = items.filter((item) => COMMERCIAL_SIGNAL_RE.test(String(item?.name ?? ''))).length;
  // Institutional about-page dumps often have zero commercial ontology signals.
  if (items.length >= 5 && withSignal / items.length < 0.25) return true;
  return false;
}

export default {
  evaluateOfferingLabel,
  filterCatalogItemsByOfferingLabel,
  catalogLooksLikeNavChrome,
  NON_OFFERING_LABEL_RE,
  NON_OFFERING_SOFT_RE,
  COMMERCIAL_SIGNAL_RE,
};

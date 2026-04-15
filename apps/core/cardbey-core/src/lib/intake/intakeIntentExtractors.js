/**
 * Lightweight deterministic extractors — no invented risky values.
 */

const PCT_RE = /(\d+(?:\.\d+)?)\s*%/i;

/**
 * @param {string} text
 * @returns {{ value: string } | null}
 */
export function extractPercentValue(text) {
  const raw = String(text ?? '').trim();
  const m = raw.match(PCT_RE);
  if (!m) return null;
  return { value: `${m[1]}%` };
}

/**
 * "fix headline to MIMI WEB" → field + value (conservative).
 * @param {string} text
 * @returns {{ field: string, value: string } | null}
 */
export function extractTextReplacement(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  const toMatch = raw.match(
    /\b(?:to|as|into|=\s*)\s*["'“”]?([^"'\n]+?)["'“”]?\s*$/i,
  );
  if (toMatch && toMatch[1]) {
    const value = String(toMatch[1]).trim();
    if (value.length < 1 || value.length > 200) return null;
    let field = 'text';
    const lower = raw.toLowerCase();
    if (/\bheadline\b/i.test(raw)) field = 'headline';
    else if (/\bhero\b/i.test(raw)) field = 'hero';
    else if (/\btitle\b/i.test(raw)) field = 'title';
    else if (/\btagline\b/i.test(raw)) field = 'tagline';
    return { field, value };
  }
  return null;
}

const CHANNELS = [
  { re: /\binstagram\b/i, channel: 'instagram' },
  { re: /\bfacebook\b/i, channel: 'facebook' },
  { re: /\bemail\b/i, channel: 'email' },
  { re: /\bsms\b|\btext\s+message\b/i, channel: 'sms' },
  { re: /\btiktok\b/i, channel: 'tiktok' },
];

/**
 * @param {string} text
 * @returns {{ channel: string } | null}
 */
export function extractChannel(text) {
  const raw = String(text ?? '');
  for (const { re, channel } of CHANNELS) {
    if (re.test(raw)) return { channel };
  }
  return null;
}

const WINDOW_PATTERNS = [
  { re: /\blast\s+7\s*days?\b/i, window: 'last_7_days' },
  { re: /\blast\s+week\b/i, window: 'last_week' },
  { re: /\blast\s+30\s*days?\b/i, window: 'last_30_days' },
  { re: /\bthis\s+month\b/i, window: 'this_month' },
  { re: /\btoday\b/i, window: 'today' },
  { re: /\bytd\b|year\s+to\s+date/i, window: 'ytd' },
];

/**
 * @param {string} text
 * @returns {{ timeWindow: string } | null}
 */
export function extractTimeWindow(text) {
  const raw = String(text ?? '');
  for (const { re, window } of WINDOW_PATTERNS) {
    if (re.test(raw)) return { timeWindow: window };
  }
  return null;
}

const SCOPE_PATTERNS = [
  { re: /\ball\s+products?\b/i, scope: 'all_products' },
  { re: /\bthis\s+category\b/i, scope: 'this_category' },
  { re: /\bwhole\s+store\b/i, scope: 'whole_store' },
  { re: /\bentire\s+catalog\b/i, scope: 'entire_catalog' },
];

/**
 * @param {string} text
 * @returns {{ scope: string } | null}
 */
export function extractScope(text) {
  const raw = String(text ?? '');
  for (const { re, scope } of SCOPE_PATTERNS) {
    if (re.test(raw)) return { scope };
  }
  return null;
}

/**
 * @param {string} userMessage
 * @returns {{ params: Record<string, unknown>, used: string[] }}
 */
export function runIntentExtractors(userMessage) {
  const params = {};
  const used = [];
  const pct = extractPercentValue(userMessage);
  if (pct) {
    params.targetPercent = pct.value;
    used.push('percent');
  }
  const rep = extractTextReplacement(userMessage);
  if (rep) {
    params.replacementField = rep.field;
    params.replacementValue = rep.value;
    used.push('text_replacement');
  }
  const ch = extractChannel(userMessage);
  if (ch) {
    params.channel = ch.channel;
    used.push('channel');
  }
  const tw = extractTimeWindow(userMessage);
  if (tw) {
    params.timeWindow = tw.timeWindow;
    used.push('time_window');
  }
  const sc = extractScope(userMessage);
  if (sc) {
    params.scope = sc.scope;
    used.push('scope');
  }
  return { params, used };
}

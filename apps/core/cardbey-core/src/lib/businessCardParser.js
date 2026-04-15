/**
 * Business-card entity parser: raw OCR text → structured entities (AU-focused).
 * Deterministic (regex + heuristics). Never throws; returns empty on invalid input.
 * Used by Agent Chat OCR to populate research_result.extractedEntities and Mission.context.businessProfile.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_HTTPS_RE = /https?:\/\/[^\s\]\)"'<>]+/gi;
const WWW_RE = /(?:^|[\s(])www\.[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9](?:\/[^\s\]\)"'<>]*)?/gi;
const AU_STATE_POSTCODE_RE = /\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\s*(\d{4})\b/i;
const STREET_SUFFIX_RE = /\b(St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Ct|Court|Pl|Place|Unit|Suite|Level|Shop)\b/i;
const LABEL_RE = /\b(Phone|Mobile|M:|Tel|Fax|Email|E:|Web|W:|Facebook|FB|Instagram|IG|TikTok)\s*[:.]?\s*/i;

// AU phone: +61..., 04xx xxx xxx, 0x xxxx xxxx (8–9 digits after leading 0)
const AU_PHONE_RE = /(?:\+61|61|0)\s*[\s\-\.\(\)]*(?:\d[\s\-\.\(\)]*){7,8}\d/g;

const SOCIAL_KEYWORDS = [
  { key: 'facebook', keywords: ['facebook', 'fb\\.com', 'facebook\\.com'] },
  { key: 'instagram', keywords: ['instagram', 'ig\\.me', 'instagram\\.com'] },
  { key: 'tiktok', keywords: ['tiktok', 'tiktok\\.com'] },
];

const MAX_RAW_TEXT_STORED = 4000;

// Assistant/OCR boilerplate to strip (case-insensitive)
const BOILERPLATE_PATTERNS = [
  /^\s*sure\s*,\s*here\s+is\s+(?:the\s+)?(?:text\s+)?extracted\s+from\s+(?:the\s+)?image\s*[.:]?\s*$/i,
  /^\s*here\s+is\s+(?:the\s+)?(?:text\s+)?extracted\s+from\s+(?:the\s+)?image\s*[.:]?\s*$/i,
  /^\s*(?:text\s+)?extracted\s+from\s+(?:the\s+)?image\s*[.:]?\s*$/i,
];
const CODE_FENCE_RE = /^```[\s\S]*?```/gm;

/**
 * Normalize raw OCR text: remove assistant boilerplate, strip code fences, collapse spaces/newlines, trim.
 * @param {string} rawText
 * @returns {string}
 */
export function normalizeOcrText(rawText) {
  if (rawText == null || typeof rawText !== 'string') return '';
  let s = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(CODE_FENCE_RE, '')
    .trim();
  const lines = s.split(/\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const filtered = lines.filter((line) => {
    const t = line.toLowerCase();
    if (BOILERPLATE_PATTERNS.some((p) => p.test(line))) return false;
    if (/text\s+extracted\s+from\s+(?:the\s+)?image/i.test(line) && line.length < 80) return false;
    return true;
  });
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract emails; first match as primary, all in meta.
 */
function extractEmails(text) {
  const emails = [];
  let m;
  const re = new RegExp(EMAIL_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const e = m[0].trim();
    if (e && !emails.includes(e)) emails.push(e);
  }
  return { primary: emails[0] || null, all: emails };
}

/**
 * Extract websites: prefer http(s) and www, exclude email-like and false positives.
 */
function extractWebsites(text) {
  const candidates = [];
  const seen = new Set();
  const add = (url) => {
    if (!url || url.includes('@') || url.length < 6) return;
    let u = url.trim();
    if (u.endsWith(',') || u.endsWith('.')) u = u.slice(0, -1);
    if (u.length < 6) return;
    if (!u.startsWith('http')) u = 'https://' + u.replace(/^\s*www\.?/i, 'www.');
    if (!seen.has(u)) {
      seen.add(u);
      candidates.push(u);
    }
  };
  let m;
  const httpsRe = new RegExp(URL_HTTPS_RE.source, 'gi');
  while ((m = httpsRe.exec(text)) !== null) add(m[0]);
  const wwwRe = new RegExp(WWW_RE.source, 'gi');
  while ((m = wwwRe.exec(text)) !== null) add(m[0].trim());
  return { primary: candidates[0] || null, all: candidates };
}

/**
 * Normalize AU phone to digits; format as readable.
 */
function normalizeAuPhone(candidate) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 8) return null;
  let d = digits;
  if (d.startsWith('61') && d.length >= 10) d = '0' + d.slice(2);
  else if (d.startsWith('61')) return null;
  if (!d.startsWith('0')) d = '0' + d;
  if (d.length < 9 || d.length > 10) return null;
  if (d[1] === '4') {
    return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : null;
  }
  if (d.length === 9) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return null;
}

function extractPhones(text, _opts) {
  const order = [];
  const normalized = new Map();
  let m;
  const re = new RegExp(AU_PHONE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    let raw = m[0].replace(/[\s,.)(\]]+\s*$/, '').trim();
    const n = normalizeAuPhone(raw);
    if (n && !normalized.has(n)) {
      normalized.set(n, true);
      order.push(n);
    }
  }
  return { phones: order, candidates: order };
}

/**
 * Social: lines containing keyword; for Facebook keep full page name (rest of line after "Facebook:").
 */
function extractSocial(lines) {
  const social = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const { key, keywords } of SOCIAL_KEYWORDS) {
      for (const kw of keywords) {
        const kwNorm = kw.replace(/\\./g, '.');
        const idx = lower.indexOf(kwNorm.toLowerCase());
        if (idx === -1) continue;
        let after = line.slice(idx + kwNorm.length).trim();
        if (after.startsWith(':') || after.startsWith('/')) after = after.slice(1).trim();
        const fullName = after.slice(0, 80).trim();
        if (key === 'facebook' && fullName && !fullName.includes('@')) {
          social[key] = fullName;
        } else if (fullName && fullName.length > 0 && fullName.length < 80 && !fullName.includes('@')) {
          const token = fullName.split(/[\s,]+/)[0]?.trim() || fullName;
          social[key] = token;
        } else if (!social[key]) {
          social[key] = true;
        }
        break;
      }
    }
  }
  return social;
}

/** True if line looks like phone numbers only (e.g. "0413 091 777 or 0466 112 628"). */
function isPhoneOnlyLine(line) {
  const digits = (line.match(/\d/g) || []).length;
  const len = line.replace(/\s/g, '').length;
  if (digits < 8) return false;
  if (digits / Math.max(1, len) > 0.5 && /(\d[\s\-\.\(\)]*){8,}/.test(line)) return true;
  if (/\b(or|and)\s+\d/.test(line) && digits >= 16) return true;
  return false;
}

/**
 * Lines that look like email / web / labeled contact blocks — not street addresses.
 * (Digit-in-line heuristics alone match "E: user2023@gmail.com W: www.example.com".)
 */
function lineLooksLikeContactOrWeb(line) {
  if (line == null || typeof line !== 'string') return true;
  const t = line.trim();
  if (!t) return true;
  if (/@/.test(t)) return true;
  if (/https?:\/\//i.test(t)) return true;
  if (/^\s*(?:e|w|m|email|web|mobile|phone|tel|fax)\s*[:.]/i.test(t) && (/@|\bwww\./i.test(t))) return true;
  if (/\bwww\.[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\b/i.test(t) && !STREET_SUFFIX_RE.test(t) && t.length < 160) return true;
  return false;
}

/**
 * Address: AU state+postcode; street suffix; exclude phone-only lines.
 */
function extractAddress(lines) {
  let statePostcodeLine = -1;
  let statePostcode = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(AU_STATE_POSTCODE_RE);
    if (m) {
      statePostcode = `${m[1].toUpperCase()} ${m[2]}`;
      statePostcodeLine = i;
      break;
    }
  }
  const withSuffix = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isPhoneOnlyLine(line)) continue;
    if (lineLooksLikeContactOrWeb(line)) continue;
    if (STREET_SUFFIX_RE.test(line) || (/\d+/.test(line) && line.length > 5 && line.length < 120))
      withSuffix.push({ i, line });
  }
  if (statePostcode && statePostcodeLine >= 0) {
    const prev = statePostcodeLine > 0 ? lines[statePostcodeLine - 1] : '';
    const street =
      prev && prev.length > 2 && prev.length < 120 && !isPhoneOnlyLine(prev) && !lineLooksLikeContactOrWeb(prev)
        ? prev
        : '';
    const combined = street ? `${street}, ${statePostcode}` : statePostcode;
    return { address: combined, confidence: 0.7 };
  }
  if (withSuffix.length > 0) {
    return { address: withSuffix[0].line, confidence: 0.5 };
  }
  return { address: null, confidence: 0 };
}

/**
 * Business name: score top ~8 lines; exclude assistant boilerplate, contact lines, digit-heavy.
 */
function scoreBusinessNameLine(line, index, totalLines) {
  if (!line || line.length < 2) return -1000;
  if (/text\s+extracted\s+from\s+(?:the\s+)?image/i.test(line)) return -1000;
  if (/sure\s*,\s*here\s+is\s+/i.test(line)) return -1000;
  let score = 0;
  const upperRatio = (line.match(/[A-Z]/g) || []).length / Math.max(1, line.replace(/\s/g, '').length);
  if (upperRatio >= 0.5 && upperRatio <= 1) score += 3;
  if (line.length >= 10 && line.length <= 40) score += 2;
  if (totalLines > 0) score += 2 * (1 - index / Math.max(1, Math.min(8, totalLines)));
  if (/@|www|http/i.test(line)) score -= 5;
  const digitCount = (line.match(/\d/g) || []).length;
  if (digitCount > line.length * 0.3) score -= 3;
  if (LABEL_RE.test(line)) score -= 2;
  return score;
}

function extractBusinessName(lines) {
  const top = lines.slice(0, 8);
  let best = null;
  let bestScore = -1000;
  for (let i = 0; i < top.length; i++) {
    const score = scoreBusinessNameLine(top[i], i, top.length);
    if (score > bestScore) {
      bestScore = score;
      best = top[i];
    }
  }
  const threshold = 0;
  return {
    businessName: bestScore > threshold ? best : null,
    confidence: bestScore > threshold ? Math.min(1, 0.5 + bestScore * 0.05) : 0,
  };
}

/**
 * Parse raw OCR text into structured entities (AU business card).
 * @param {string} rawText - Raw OCR output
 * @param {{ country?: string, allowInternational?: boolean }} opts - country default "AU"
 * @returns {{
 *   extractedEntities: { businessName?: string, phones?: string[], email?: string, website?: string, address?: string, social?: object },
 *   confidence: object,
 *   meta: { rawLines?: string[], emails?: string[], websites?: string[], phoneCandidates?: string[] }
 * }}
 */
export function parseBusinessCardOCR(rawText, opts = {}) {
  const out = {
    extractedEntities: {},
    confidence: {},
    meta: { rawLines: [], emails: [], websites: [], phoneCandidates: [] },
  };
  try {
    if (rawText == null || typeof rawText !== 'string') return out;
    const country = (opts && opts.country) || 'AU';
    const normalized = normalizeOcrText(rawText);
    const rawLines = normalized.split(/\n/).map((l) => l.trim()).filter(Boolean);
    out.meta.rawLines = rawLines;

    const { primary: email, all: emails } = extractEmails(normalized);
    out.meta.emails = emails;
    if (email) {
      out.extractedEntities.email = email;
      out.confidence.email = 0.95;
    }

    const { primary: website, all: websites } = extractWebsites(normalized);
    out.meta.websites = websites;
    if (website) {
      out.extractedEntities.website = website;
      out.confidence.website = 0.85;
    }

    if (country === 'AU' || (opts && opts.allowInternational)) {
      const { phones, candidates } = extractPhones(normalized, opts);
      out.meta.phoneCandidates = candidates;
      if (phones.length) {
        out.extractedEntities.phones = phones;
        const len = phones[0]?.replace(/\s/g, '').length || 0;
        out.confidence.phones = len >= 9 && len <= 10 ? 0.95 : 0.8;
      }
    }

    const social = extractSocial(rawLines);
    if (Object.keys(social).length) {
      out.extractedEntities.social = social;
    }

    const { address, confidence: addrConf } = extractAddress(rawLines);
    if (address) {
      out.extractedEntities.address = address;
      out.confidence.address = addrConf;
    }

    const { businessName, confidence: nameConf } = extractBusinessName(rawLines);
    if (businessName) {
      out.extractedEntities.businessName = businessName;
      out.confidence.businessName = nameConf;
    }
  } catch (_) {
    // Never throw; return empty
  }
  return out;
}

/**
 * Normalize extractedEntities to Mission.context.businessProfile shape (name, address, phones, email, website, social).
 * @param {object} entities - extractedEntities from parseBusinessCardOCR or parseOcrToEntities
 * @returns {object} Profile suitable for mergeMissionContext(missionId, { businessProfile }).
 */
export function entitiesToBusinessProfile(entities) {
  if (!entities || typeof entities !== 'object') return {};
  const name = (entities.businessName || entities.name || '').toString().trim();
  const profile = {};
  if (name) profile.name = name;
  if (entities.address && String(entities.address).trim()) profile.address = String(entities.address).trim();
  if (Array.isArray(entities.phones) && entities.phones.length)
    profile.phones = entities.phones.map((p) => String(p).trim()).filter(Boolean);
  if (entities.email && String(entities.email).trim()) profile.email = String(entities.email).trim();
  if (entities.website && String(entities.website).trim()) profile.website = String(entities.website).trim();
  if (entities.social && typeof entities.social === 'object') profile.social = entities.social;
  return profile;
}

/**
 * Truncate raw text for storage in payload.details (avoids huge messages / PII).
 * @param {string} rawText
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateRawTextForPayload(rawText, maxLen = MAX_RAW_TEXT_STORED) {
  if (rawText == null || typeof rawText !== 'string') return '';
  if (rawText.length <= maxLen) return rawText;
  return rawText.slice(0, maxLen) + '\n… [truncated]';
}

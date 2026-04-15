/**
 * Parse raw OCR text into structured entities (business card / storefront).
 * Heuristic only; does not call OCR or modify any existing OCR implementation.
 */

const PHONE_RE = /(\+?[\d\s\-\.\(\)]{8,20})/g;
const EMAIL_RE = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const URL_RE = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
const FACEBOOK_RE = /(?:facebook|fb\.com|facebook\.com)\s*[\/:]?\s*([^\s,]+)?/gi;

/**
 * @param {string} rawText - Raw OCR text
 * @returns {{ businessName?: string, phones?: string[], email?: string, website?: string, address?: string, social?: { facebook?: string } }}
 */
export function parseOcrToEntities(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};
  const text = rawText.trim();
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const entities = {};

  const phones = [];
  let m;
  const phoneIter = text.matchAll(PHONE_RE);
  for (const match of phoneIter) {
    const p = match[1].replace(/\s/g, '').replace(/^\+/, '');
    if (p.length >= 8 && p.length <= 20 && !phones.includes(p)) phones.push(p);
  }
  if (phones.length) entities.phones = phones.slice(0, 5);

  const emails = [...text.matchAll(EMAIL_RE)].map((e) => e[1]);
  if (emails.length) entities.email = emails[0];

  const urls = [];
  const urlIter = text.matchAll(URL_RE);
  for (const match of urlIter) {
    let u = (match[1] || match[2] || '').trim();
    if (u && !u.startsWith('http')) u = 'https://' + u;
    if (u && !urls.includes(u)) urls.push(u);
  }
  if (urls.length) entities.website = urls[0];

  const fbMatch = [...text.matchAll(FACEBOOK_RE)];
  if (fbMatch.length) {
    const handle = fbMatch[0][1]?.trim();
    entities.social = { facebook: handle || true };
  }

  if (lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine.length > 1 && firstLine.length < 120 && !firstLine.match(/^\d+/) && !firstLine.match(EMAIL_RE))
      entities.businessName = firstLine;
  }

  const addressCandidates = lines.filter((l) => l.length > 5 && l.length < 120 && (/\d+/.test(l) || /\b(road|street|st|ave|drive|dr|vic|nsw|qld)\b/i.test(l)));
  if (addressCandidates.length) entities.address = addressCandidates[0];

  return entities;
}

/**
 * Build a 1–3 sentence summary and bullets from entities + raw text.
 * When no entities are detected, still returns a helpful summary and bullets (raw text excerpt).
 */
export function buildSummaryAndBullets(entities, rawText) {
  const bullets = [];
  if (entities.businessName) bullets.push(`Business name: ${entities.businessName}`);
  if (entities.address) bullets.push(`Address: ${entities.address}`);
  if (entities.phones?.length) bullets.push(`Phone: ${entities.phones.join(', ')}`);
  if (entities.email) bullets.push(`Email: ${entities.email}`);
  if (entities.website) bullets.push(`Website: ${entities.website}`);
  if (entities.social?.facebook) bullets.push(entities.social.facebook === true ? 'Facebook: present' : `Facebook: ${entities.social.facebook}`);
  if (entities.social?.instagram) bullets.push(entities.social.instagram === true ? 'Instagram: present' : `Instagram: ${entities.social.instagram}`);
  if (entities.social?.tiktok) bullets.push(entities.social.tiktok === true ? 'TikTok: present' : `TikTok: ${entities.social.tiktok}`);
  if (bullets.length === 0 && rawText) {
    const excerpt = rawText.trim().split(/\n/)[0]?.slice(0, 200) || rawText.slice(0, 200);
    bullets.push(excerpt + (rawText.length > 200 ? '…' : ''));
  }
  const hasStructured = !!(entities.businessName || entities.address || (entities.phones && entities.phones.length) || entities.email || entities.website);
  const summary =
    hasStructured
      ? `${bullets.slice(0, 3).join('. ')}.`
      : rawText
        ? 'Text extracted from image (no structured business details detected). Use Details to see raw text.'
        : 'No text extracted from image.';
  return { summary, bullets };
}

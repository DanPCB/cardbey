/**
 * Path A research quality gates — strong identity match, field reports, checkpoint copy.
 * Pure helpers + thin blackboard wrappers (non-fatal).
 */

import { CONFIDENCE } from '../storeCreationResearch/types.js';

/** Reasons that count as strong identity evidence (not Google name-alone). */
export const STRONG_IDENTITY_REASONS = Object.freeze([
  'phone',
  'website',
  'name-exact',
  'domain-exact',
  'document-name',
  'google-place-website',
]);

/**
 * @param {string[]|null|undefined} reasons
 * @returns {boolean}
 */
export function hasStrongIdentityEvidence(reasons) {
  if (!Array.isArray(reasons) || !reasons.length) return false;
  return reasons.some((r) => STRONG_IDENTITY_REASONS.includes(String(r)));
}

/**
 * Verified match: USE threshold + strong identity signal.
 * @param {{ confidence?: number, reasons?: string[], matched?: boolean }|null|undefined} match
 */
export function isVerifiedResearchMatch(match) {
  if (!match || typeof match !== 'object') return false;
  const confidence = typeof match.confidence === 'number' ? match.confidence : 0;
  return confidence >= CONFIDENCE.USE && hasStrongIdentityEvidence(match.reasons);
}

/**
 * @param {{ confidence?: number, reasons?: string[] }|null|undefined} match
 */
export function summarizeMatchSignals(match) {
  const reasons = Array.isArray(match?.reasons) ? match.reasons : [];
  return {
    nameMatched: reasons.includes('name-exact') || reasons.includes('name-partial'),
    nameExact: reasons.includes('name-exact'),
    websiteMatched: reasons.includes('website') || reasons.includes('domain-exact'),
    phoneMatched: reasons.includes('phone'),
    confidence: typeof match?.confidence === 'number' ? match.confidence : 0,
    reasons,
  };
}

/**
 * @param {import('../storeCreationResearch/types.js').BusinessFacts|null|undefined} facts
 * @returns {{ fieldsExtracted: string[], fieldsMissing: string[], mapped: Record<string, unknown> }}
 */
export function reportExtractedResearchFields(facts) {
  const f = facts && typeof facts === 'object' ? facts : {};
  const mapped = {
    businessName: f.businessName?.value ?? null,
    phone: f.phone?.value ?? null,
    address: f.address?.value ?? null,
    formattedAddress: f.address?.value ?? null,
    website: f.website?.value ?? null,
    openingHours: f.openingHours?.value ?? null,
    description:
      typeof f.description?.value === 'string' && f.description.value.trim().length > 50
        ? f.description.value.trim()
        : f.description?.value ?? null,
    category: f.category?.value ?? null,
  };

  /** @type {string[]} */
  const fieldsExtracted = [];
  /** @type {string[]} */
  const fieldsMissing = [];
  for (const [key, value] of Object.entries(mapped)) {
    if (key === 'formattedAddress') continue;
    if (value != null && String(value).trim() !== '') fieldsExtracted.push(key);
    else fieldsMissing.push(key);
  }
  if (mapped.address && !fieldsExtracted.includes('formattedAddress')) {
    fieldsExtracted.push('formattedAddress');
  } else if (!mapped.address) {
    fieldsMissing.push('formattedAddress');
  }

  return { fieldsExtracted, fieldsMissing, mapped };
}

/**
 * Brand checkpoint prompt for Path A research quality.
 * Generative mode: return basePrompt unchanged.
 *
 * @param {{
 *   mode?: string|null,
 *   basePrompt?: string|null,
 *   businessName?: string|null,
 *   address?: string|null,
 *   itemCount?: number|null,
 *   catalogSource?: string|null,
 *   lowConfidenceFallback?: boolean,
 * }} opts
 */
export function buildResearchQualityCheckpointPrompt(opts = {}) {
  const base =
    (typeof opts.basePrompt === 'string' && opts.basePrompt.trim()) ||
    'Your store draft is ready. You can personalise it now by adding your branding.';
  const mode = String(opts.mode ?? '').trim();
  if (mode === 'generative' || !mode) return base;

  const name = String(opts.businessName ?? 'your business').trim() || 'your business';
  const address = String(opts.address ?? '').trim();
  const itemCount = Number(opts.itemCount);
  const n = Number.isFinite(itemCount) && itemCount > 0 ? Math.floor(itemCount) : 0;
  const catalogSource = String(opts.catalogSource ?? '').trim();

  if (opts.lowConfidenceFallback === true) {
    return (
      `We couldn't find an exact match for ${name}. ` +
      `This draft uses suggested content — please add your real details. ` +
      base
    );
  }

  const where = address ? ` at ${address}` : '';
  const sourced =
    catalogSource === 'scraped' ||
    catalogSource === 'research' ||
    catalogSource === 'STRUCTURED_CATALOG' ||
    catalogSource === 'SEMANTIC_WEBSITE_OFFERINGS';
  const menuLine =
    n > 0
      ? sourced
        ? `${n} menu items were sourced from your website.`
        : `${n} menu items were suggested for you to verify.`
      : `Menu items were suggested for you to verify.`;

  return (
    `We found ${name}${where}. ${menuLine} Please review before publishing. ` + base
  );
}

/**
 * @param {string|null|undefined} missionId
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
export async function appendPathABlackboardEvent(missionId, eventType, payload = {}) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || !eventType) return { ok: false, skipped: true };
  try {
    const { appendStoreCreationBlackboardEvent } = await import(
      '../storeCreation/storeCreationBlackboard.js'
    );
    return await appendStoreCreationBlackboardEvent(mid, eventType, {
      ...payload,
      missionId: mid,
    });
  } catch (err) {
    console.warn(`[pathAResearchQuality] blackboard ${eventType} failed:`, err?.message ?? err);
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Persist research quality slice on Mission.context for checkpoint enrichment.
 * @param {import('@prisma/client').PrismaClient|null|undefined} prisma
 * @param {string|null|undefined} missionId
 * @param {Record<string, unknown>} quality
 */
export async function persistResearchQualityToMission(prisma, missionId, quality) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!prisma || !mid || !quality) return;
  try {
    const { mergeMissionContext } = await import('../mission.js');
    await mergeMissionContext(mid, { storeCreationResearchQuality: quality }, { prisma });
  } catch (err) {
    console.warn('[pathAResearchQuality] persist quality failed:', err?.message ?? err);
  }
}

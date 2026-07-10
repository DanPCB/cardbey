/**
 * Deterministic semantic scoring for service image candidates.
 */

import { evaluateServiceMismatchGuard } from './serviceImageMismatchGuards.js';

export const STRONG_MATCH = 0.72;
export const ACCEPTABLE_MATCH = 0.58;
export const REJECT_MATCH = 0.42;

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'in', 'on', 'of', 'to', 'for', '&']);

/**
 * @param {string} s
 */
function tokenize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * @param {string} haystack
 * @param {string[]} terms
 */
function countTermHits(haystack, terms) {
  const text = haystack.toLowerCase();
  return terms.filter((t) => t && text.includes(String(t).toLowerCase())).length;
}

/**
 * @param {import('./serviceImageTypes.js').ServiceImageIntent} intent
 * @param {import('./serviceImageTypes.js').ServiceImageCandidate} candidate
 * @param {{ isDuplicate?: boolean, businessCategory?: string }} [opts]
 * @returns {{ metadataScore: number, matchedTerms: string[], rejectedConflicts: string[], hardReject: boolean }}
 */
export function scoreServiceImageCandidateMetadata(intent, candidate, opts = {}) {
  const text = [candidate.title, candidate.altText, ...(candidate.tags ?? []), candidate.sourceQuery]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const canonicalPhrase = intent.canonicalTitle.toLowerCase();
  let raw = 0;
  const matchedTerms = [];

  if (canonicalPhrase && text.includes(canonicalPhrase)) {
    raw += 30;
    matchedTerms.push(intent.canonicalTitle);
  }

  const objectHits = countTermHits(text, intent.objectTerms);
  if (objectHits > 0) {
    raw += Math.min(24, objectHits * 12);
    matchedTerms.push(...intent.objectTerms.filter((t) => text.includes(t.toLowerCase())));
  }

  const positiveHits = countTermHits(text, intent.positiveTerms);
  if (positiveHits > 0) {
    raw += Math.min(16, positiveHits * 4);
  }

  const actionHits = countTermHits(text, intent.actionTerms);
  if (actionHits > 0) {
    raw += Math.min(18, actionHits * 9);
    matchedTerms.push(...intent.actionTerms.filter((t) => text.includes(t.toLowerCase())));
  }

  const subjectHits = countTermHits(text, intent.subjectTerms);
  if (subjectHits > 0) {
    raw += Math.min(12, subjectHits * 6);
    matchedTerms.push(...intent.subjectTerms.filter((t) => text.includes(t.toLowerCase())));
  }

  const envHits = countTermHits(text, intent.environmentTerms);
  if (envHits > 0) {
    raw += Math.min(10, envHits * 5);
  }

  if (opts.businessCategory && text.includes(String(opts.businessCategory).toLowerCase())) {
    raw += 8;
  }

  if (candidate.width && candidate.height && candidate.width >= candidate.height) {
    raw += 5;
  }

  const negativeHits = countTermHits(text, intent.negativeTerms);
  if (negativeHits > 0) {
    raw -= 35 * Math.min(negativeHits, 2);
  }

  const guard = evaluateServiceMismatchGuard(intent.canonicalTitle, text);
  const rejectedConflicts = [...guard.conflicts];
  let hardReject = false;
  if (!guard.pass) {
    raw -= 25;
    hardReject = guard.conflicts.length > 0;
    if (guard.missingRequired) raw -= 10;
  }

  const queryTokens = tokenize(candidate.sourceQuery);
  const overlap = queryTokens.filter((t) => text.includes(t)).length;
  if (overlap === 0 && text.trim()) raw -= 20;
  else raw += Math.min(8, overlap * 2);

  if (opts.isDuplicate) raw -= 15;

  if (!text.trim()) raw -= 20;

  const metadataScore = Math.max(0, Math.min(1, raw / 100));
  return {
    metadataScore,
    matchedTerms: [...new Set(matchedTerms)],
    rejectedConflicts,
    hardReject,
  };
}

/**
 * @param {number} metadataScore
 * @param {number|null|undefined} visualScore
 * @param {boolean} visualAvailable
 */
export function combineServiceImageScores(metadataScore, visualScore, visualAvailable) {
  if (visualAvailable && typeof visualScore === 'number') {
    return metadataScore * 0.55 + visualScore * 0.45;
  }
  return metadataScore;
}

/**
 * @param {number} finalScore
 * @param {boolean} hardReject
 * @returns {'exact'|'strong'|'acceptable'|'missing'}
 */
export function classifyMatchStatus(finalScore, hardReject) {
  if (hardReject || finalScore < REJECT_MATCH) return 'missing';
  if (finalScore >= STRONG_MATCH) return 'strong';
  if (finalScore >= ACCEPTABLE_MATCH) return 'acceptable';
  return 'missing';
}

/**
 * @param {number} finalScore
 * @param {boolean} hardReject
 * @param {number} minThreshold
 */
export function shouldAcceptServiceImage(finalScore, hardReject, minThreshold = ACCEPTABLE_MATCH) {
  if (hardReject) return false;
  if (finalScore < minThreshold) return false;
  return true;
}

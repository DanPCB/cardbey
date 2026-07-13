/**
 * Business identity matching before external content import.
 */

function normalizeName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeDomain(url) {
  const raw = String(url ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const u = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return raw.replace(/^www\./, '').split('/')[0];
  }
}

/**
 * @typedef {'EXACT_MATCH'|'PROBABLE_MATCH'|'AMBIGUOUS'|'NO_MATCH'} IdentityMatchStatus
 */

/**
 * @typedef {Object} BusinessIdentityMatch
 * @property {number} score
 * @property {IdentityMatchStatus} status
 * @property {string[]} matchedSignals
 * @property {string[]} conflictingSignals
 */

/**
 * @param {object} target
 * @param {object} candidate
 * @returns {BusinessIdentityMatch}
 */
export function scoreBusinessIdentityMatch(target, candidate) {
  let score = 0;
  const matchedSignals = [];
  const conflictingSignals = [];

  const targetName = normalizeName(target.businessName ?? target.canonicalName ?? target.name);
  const candidateName = normalizeName(candidate.businessName ?? candidate.name ?? candidate.tradingName);
  if (targetName && candidateName) {
    if (targetName === candidateName) {
      score += 0.35;
      matchedSignals.push('name_exact');
    } else if (targetName.includes(candidateName) || candidateName.includes(targetName)) {
      score += 0.2;
      matchedSignals.push('name_partial');
    } else {
      conflictingSignals.push('name_mismatch');
    }
  }

  const targetPhone = digitsOnly(target.phone);
  const candidatePhone = digitsOnly(candidate.phone);
  if (targetPhone && candidatePhone) {
    if (targetPhone === candidatePhone || targetPhone.endsWith(candidatePhone) || candidatePhone.endsWith(targetPhone)) {
      score += 0.25;
      matchedSignals.push('phone_match');
    } else {
      score -= 0.15;
      conflictingSignals.push('phone_mismatch');
    }
  }

  const targetDomain = normalizeDomain(target.website ?? target.domain);
  const candidateDomain = normalizeDomain(candidate.website ?? candidate.sourceUrl ?? candidate.domain);
  if (targetDomain && candidateDomain) {
    if (targetDomain === candidateDomain) {
      score += 0.25;
      matchedSignals.push('domain_match');
    } else {
      conflictingSignals.push('domain_mismatch');
    }
  }

  const targetAddr = normalizeName(target.address ?? target.location);
  const candidateAddr = normalizeName(candidate.address ?? candidate.location);
  if (targetAddr && candidateAddr) {
    if (targetAddr === candidateAddr) {
      score += 0.2;
      matchedSignals.push('address_exact');
    } else if (targetAddr.includes(candidateAddr) || candidateAddr.includes(targetAddr)) {
      score += 0.1;
      matchedSignals.push('address_partial');
    } else {
      conflictingSignals.push('address_mismatch');
    }
  }

  const targetCat = normalizeName(target.category);
  const candidateCat = normalizeName(candidate.category ?? candidate.businessType);
  if (targetCat && candidateCat && (targetCat === candidateCat || targetCat.includes(candidateCat) || candidateCat.includes(targetCat))) {
    score += 0.05;
    matchedSignals.push('category_match');
  }

  const clamped = Math.max(0, Math.min(1, score));
  /** @type {IdentityMatchStatus} */
  let status = 'NO_MATCH';
  if (clamped >= 0.82 && matchedSignals.includes('name_exact') && (matchedSignals.includes('phone_match') || matchedSignals.includes('domain_match') || matchedSignals.includes('address_exact'))) {
    status = 'EXACT_MATCH';
  } else if (clamped >= 0.55 && conflictingSignals.length <= 1) {
    status = 'PROBABLE_MATCH';
  } else if (clamped >= 0.35 || (matchedSignals.includes('name_partial') && conflictingSignals.length === 0)) {
    status = 'AMBIGUOUS';
  }

  return { score: clamped, status, matchedSignals, conflictingSignals };
}

/**
 * @param {BusinessIdentityMatch} match
 * @param {import('./performerGroundingTypes.js').SourcePolicy} [policy]
 */
export function identityMatchAllowsImport(match, policy) {
  const min = policy?.minIdentityMatch ?? 'PROBABLE_MATCH';
  const rank = { EXACT_MATCH: 4, PROBABLE_MATCH: 3, AMBIGUOUS: 2, NO_MATCH: 1 };
  return (rank[match.status] ?? 0) >= (rank[min] ?? 3);
}

export default { scoreBusinessIdentityMatch, identityMatchAllowsImport };

/**
 * Identity-resolution gate — before deep fetch / merge.
 * Never merges on display name alone.
 */

export type IdentityMatchResult =
  | 'MATCHED'
  | 'PROBABLE_MATCH'
  | 'AMBIGUOUS'
  | 'CONFLICT'
  | 'NOT_MATCHED';

export type IdentitySignals = {
  name?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  address?: string | null;
  phone?: string | null;
  websiteHost?: string | null;
  abn?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  category?: string | null;
  externalId?: string | null;
};

export type IdentityExplanation = {
  result: IdentityMatchResult;
  reasons: string[];
  /** Internal only — never expose raw score publicly */
  internalScore: number;
};

function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function phonesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = String(a ?? '').replace(/\D/g, '');
  const db = String(b ?? '').replace(/\D/g, '');
  if (!da || !db) return false;
  return da.slice(-9) === db.slice(-9);
}

/**
 * Compare candidate (local) vs source candidate (external listing).
 * ABR-only legal match without trading-name corroboration → PROBABLE_MATCH max (not MATCHED for marketing).
 */
export function resolveIdentityMatch(
  local: IdentitySignals,
  remote: IdentitySignals,
  opts?: { abrOnly?: boolean },
): IdentityExplanation {
  const reasons: string[] = [];
  let score = 0;

  const ln = norm(local.name);
  const rn = norm(remote.name);
  if (ln && rn && ln === rn) {
    score += 40;
    reasons.push('exact_normalized_name');
  } else if (ln && rn && (ln.includes(rn) || rn.includes(ln))) {
    score += 20;
    reasons.push('partial_name');
  } else if (ln && rn) {
    reasons.push('name_mismatch');
    return { result: 'NOT_MATCHED', reasons, internalScore: 0 };
  }

  const ls = norm(local.suburb);
  const rs = norm(remote.suburb);
  if (ls && rs && ls === rs) {
    score += 25;
    reasons.push('suburb_match');
  } else if (ls && rs && ls !== rs) {
    reasons.push('suburb_conflict');
    return { result: 'CONFLICT', reasons, internalScore: score };
  }

  if (local.postcode && remote.postcode && local.postcode === remote.postcode) {
    score += 10;
    reasons.push('postcode_match');
  }

  const la = norm(local.address);
  const ra = norm(remote.address);
  if (la && ra && la === ra) {
    score += 20;
    reasons.push('address_match');
  }

  if (phonesEqual(local.phone, remote.phone)) {
    score += 25;
    reasons.push('phone_match');
  } else if (local.phone && remote.phone) {
    reasons.push('phone_conflict');
    return { result: 'AMBIGUOUS', reasons, internalScore: score };
  }

  const lh = local.websiteHost ?? null;
  const rh = remote.websiteHost ?? hostOf(remote.websiteHost);
  if (lh && rh && lh === rh) {
    score += 30;
    reasons.push('website_host_match');
  }

  if (local.externalId && remote.externalId && local.externalId === remote.externalId) {
    score += 35;
    reasons.push('external_id_match');
  }

  if (local.abn && remote.abn && local.abn === remote.abn) {
    score += 15;
    reasons.push('abn_match');
  }

  if (opts?.abrOnly && reasons.includes('abn_match') && !reasons.includes('exact_normalized_name')) {
    return {
      result: 'PROBABLE_MATCH',
      reasons: [...reasons, 'abr_only_insufficient_for_marketing_identity'],
      internalScore: score,
    };
  }

  if (score >= 80) return { result: 'MATCHED', reasons, internalScore: score };
  if (score >= 55) return { result: 'PROBABLE_MATCH', reasons, internalScore: score };
  if (score >= 30) return { result: 'AMBIGUOUS', reasons, internalScore: score };
  return { result: 'NOT_MATCHED', reasons, internalScore: score };
}

export { hostOf as websiteHostOf };

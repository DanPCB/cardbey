/**
 * SKP field-level provenance tags.
 *
 * Bridges existing Cardbey vocabs into one enum:
 * - Mission 001: REAL | INFERRED | GENERATED | UNKNOWN
 * - BOI knowledgeStates: USER_DEFINED | DISCOVERED_FACT | AI_INFERENCE | RECOMMENDATION | ASSUMPTION
 * - Business.provenance: owner | consumer_capture
 *
 * Authority (highest wins when merging):
 *   SELLER_CONFIRMED > PLATFORM_OBSERVED > USER_CONTRIBUTED > AI_INFERRED > PLATFORM_INFERRED > UNVERIFIED
 */

export const ProvenanceTag = Object.freeze({
  SELLER_CONFIRMED: 'SELLER_CONFIRMED',
  PLATFORM_OBSERVED: 'PLATFORM_OBSERVED',
  AI_INFERRED: 'AI_INFERRED',
  USER_CONTRIBUTED: 'USER_CONTRIBUTED',
  PLATFORM_INFERRED: 'PLATFORM_INFERRED',
  UNVERIFIED: 'UNVERIFIED',
});

/** @type {Readonly<Record<string, number>>} */
export const PROVENANCE_AUTHORITY = Object.freeze({
  [ProvenanceTag.SELLER_CONFIRMED]: 60,
  [ProvenanceTag.PLATFORM_OBSERVED]: 50,
  [ProvenanceTag.USER_CONTRIBUTED]: 40,
  [ProvenanceTag.AI_INFERRED]: 30,
  [ProvenanceTag.PLATFORM_INFERRED]: 20,
  [ProvenanceTag.UNVERIFIED]: 10,
});

/**
 * @param {string | null | undefined} tag
 * @returns {number}
 */
export function provenanceAuthority(tag) {
  return PROVENANCE_AUTHORITY[String(tag || '')] ?? 0;
}

/**
 * @template T
 * @param {T} value
 * @param {string} provenance
 * @param {string} [source]
 * @param {number} [confidence]
 */
export function withProvenance(value, provenance, source, confidence = 0.8) {
  const tag = Object.values(ProvenanceTag).includes(provenance)
    ? provenance
    : ProvenanceTag.UNVERIFIED;
  const conf = Number.isFinite(Number(confidence))
    ? Math.max(0, Math.min(1, Number(confidence)))
    : 0.8;
  return {
    value,
    provenance: tag,
    ...(source ? { source: String(source) } : {}),
    confidence: conf,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map Mission 001 PROVENANCE_STATUS → SKP ProvenanceTag.
 * @param {string | null | undefined} status
 * @param {{ ownerConfirmed?: boolean }} [opts]
 */
export function mapMission001StatusToSkp(status, opts = {}) {
  const s = String(status || '').toUpperCase();
  if (opts.ownerConfirmed && (s === 'REAL' || s === '')) {
    return ProvenanceTag.SELLER_CONFIRMED;
  }
  if (s === 'REAL') return ProvenanceTag.PLATFORM_OBSERVED;
  if (s === 'INFERRED' || s === 'GENERATED') return ProvenanceTag.AI_INFERRED;
  return ProvenanceTag.UNVERIFIED;
}

/**
 * Map BOI KNOWLEDGE_STATES → SKP ProvenanceTag.
 * @param {string | null | undefined} state
 */
export function mapBoiKnowledgeStateToSkp(state) {
  const s = String(state || '').toUpperCase();
  if (s === 'USER_DEFINED') return ProvenanceTag.SELLER_CONFIRMED;
  if (s === 'DISCOVERED_FACT') return ProvenanceTag.PLATFORM_OBSERVED;
  if (s === 'AI_INFERENCE' || s === 'RECOMMENDATION') return ProvenanceTag.AI_INFERRED;
  if (s === 'ASSUMPTION') return ProvenanceTag.PLATFORM_INFERRED;
  return ProvenanceTag.UNVERIFIED;
}

/**
 * Default tag from Business.provenance + claimStatus.
 * @param {{ provenance?: string|null, claimStatus?: string|null }} business
 */
export function defaultOwnerishProvenance(business) {
  const claim = String(business?.claimStatus || '').toLowerCase();
  const prov = String(business?.provenance || '').toLowerCase();
  if (claim === 'claimed' || prov === 'owner') return ProvenanceTag.SELLER_CONFIRMED;
  if (prov === 'consumer_capture') return ProvenanceTag.USER_CONTRIBUTED;
  return ProvenanceTag.PLATFORM_OBSERVED;
}

/**
 * Prefer higher-authority provenanced field when merging.
 * @template T
 */
export function preferProvenanced(current, next) {
  if (!next) return current ?? null;
  if (!current) return next;
  if (provenanceAuthority(next.provenance) > provenanceAuthority(current.provenance)) return next;
  if (
    provenanceAuthority(next.provenance) === provenanceAuthority(current.provenance) &&
    Number(next.confidence ?? 0) > Number(current.confidence ?? 0)
  ) {
    return next;
  }
  return current;
}

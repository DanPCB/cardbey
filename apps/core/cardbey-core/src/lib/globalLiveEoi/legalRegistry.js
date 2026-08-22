/**
 * Server legal-document registry for Global Live EOI ops/health.
 * Does not invent APPROVED status — mirrors dashboard draft documents.
 */

export const LEGAL_DOC_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  RETIRED: 'RETIRED',
});

/** Keep in sync with dashboard `documentRegistry.ts` until a shared package exists. */
export const CURRENT_PLATFORM_TERMS_VERSION = 'cardbey-platform-terms-v0.1-draft';
export const CURRENT_PRIVACY_POLICY_VERSION = 'cardbey-privacy-policy-v0.1-draft';

/**
 * @typedef {{
 *   key: string,
 *   version: string,
 *   status: 'DRAFT' | 'APPROVED' | 'RETIRED',
 *   effectiveAt: string | null,
 *   route: string,
 *   locales: string[],
 * }} LegalDocumentRecord
 */

/** @type {Record<string, LegalDocumentRecord>} */
const REGISTRY = {
  PLATFORM_TERMS: {
    key: 'PLATFORM_TERMS',
    version: CURRENT_PLATFORM_TERMS_VERSION,
    status: LEGAL_DOC_STATUS.DRAFT,
    effectiveAt: null,
    route: '/terms',
    locales: ['en', 'vi'],
  },
  PRIVACY_POLICY: {
    key: 'PRIVACY_POLICY',
    version: CURRENT_PRIVACY_POLICY_VERSION,
    status: LEGAL_DOC_STATUS.DRAFT,
    effectiveAt: null,
    route: '/privacy',
    locales: ['en', 'vi'],
  },
};

export function listLegalDocuments() {
  return Object.values(REGISTRY).map((d) => ({ ...d }));
}

export function getLegalDocument(key) {
  const d = REGISTRY[key];
  return d ? { ...d } : null;
}

/**
 * Aggregate readiness for EOI applicants (requires Terms + Privacy APPROVED).
 * @returns {{ legalReadiness: 'DRAFT' | 'APPROVED', unapproved: string[], presentedVersions: Record<string, string> }}
 */
export function getEoiLegalReadiness() {
  const docs = [REGISTRY.PLATFORM_TERMS, REGISTRY.PRIVACY_POLICY];
  const unapproved = docs.filter((d) => d.status !== LEGAL_DOC_STATUS.APPROVED).map((d) => d.key);
  return {
    legalReadiness: unapproved.length ? LEGAL_DOC_STATUS.DRAFT : LEGAL_DOC_STATUS.APPROVED,
    unapproved,
    presentedVersions: {
      termsVersion: REGISTRY.PLATFORM_TERMS.version,
      privacyVersion: REGISTRY.PRIVACY_POLICY.version,
    },
  };
}

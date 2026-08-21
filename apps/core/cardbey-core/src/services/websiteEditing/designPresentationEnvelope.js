/**
 * Draft-scoped design presentation envelope (C2).
 * Stored at DraftStore.preview.website.designPresentationV1
 */

export const DESIGN_PRESENTATION_CONTRACT_VERSION = 'designPresentationV1';

/**
 * @param {object} args
 */
export function buildDesignPresentationEnvelope({
  previous = null,
  templateId = null,
  heroRef = null,
  layoutVariant = null,
  designTokensRef = null,
  source = 'owner_mutation',
  bootstrapSource = null,
  actorId = null,
  baseRevisionFingerprint = null,
  compositionRelation = null,
}) {
  const now = new Date().toISOString();
  const prev = previous && typeof previous === 'object' ? previous : {};
  return {
    contractVersion: DESIGN_PRESENTATION_CONTRACT_VERSION,
    templateId: templateId != null ? templateId : prev.templateId ?? null,
    designTokensRef:
      designTokensRef != null ? designTokensRef : prev.designTokensRef ?? null,
    heroRef: heroRef != null ? heroRef : prev.heroRef ?? null,
    layoutVariant: layoutVariant != null ? layoutVariant : prev.layoutVariant ?? null,
    provenance: {
      source,
      bootstrapSource: bootstrapSource ?? prev.provenance?.bootstrapSource ?? null,
      actorId: actorId ?? prev.provenance?.actorId ?? null,
      updatedAt: now,
    },
    baseRevisionFingerprint:
      baseRevisionFingerprint ?? prev.baseRevisionFingerprint ?? null,
    compositionRelation:
      compositionRelation != null ? compositionRelation : prev.compositionRelation ?? null,
  };
}

export function readDesignPresentationEnvelope(preview) {
  const website =
    preview && typeof preview === 'object' && preview.website && typeof preview.website === 'object'
      ? preview.website
      : null;
  const env = website?.designPresentationV1;
  if (!env || typeof env !== 'object') return null;
  if (env.contractVersion !== DESIGN_PRESENTATION_CONTRACT_VERSION) return null;
  return env;
}

/**
 * Fingerprint for OCC — draft id + updatedAt ISO.
 * @param {{ id: string, updatedAt: Date|string }} draft
 */
export function draftRevisionFingerprint(draft) {
  const id = String(draft?.id || '').trim();
  const updated =
    draft?.updatedAt instanceof Date
      ? draft.updatedAt.toISOString()
      : String(draft?.updatedAt || '');
  return `${id}:${updated}`;
}

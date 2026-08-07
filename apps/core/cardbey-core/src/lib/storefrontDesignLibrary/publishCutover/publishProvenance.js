/**
 * Immutable publish-source provenance (Phase 8B).
 * Audit only — does not confer global authority.
 */

/**
 * @param {{
 *   source: 'legacy'|'projection',
 *   projectionFingerprint?: string|null,
 *   acceptanceFingerprint?: string|null,
 *   blueprintId?: string|null,
 *   blueprintVersion?: string|number|null,
 *   projectionVersion?: string|number|null,
 *   renderAdapterVersion?: string|number|null,
 *   publishedAt?: string|null,
 *   fallbackReason?: string|null,
 * }} input
 */
export function buildPublishProvenance(input) {
  const source = input.source === 'projection' ? 'projection' : 'legacy';
  const publishedAt = input.publishedAt || new Date().toISOString();
  if (source === 'legacy') {
    return Object.freeze({
      source: /** @type {const} */ ('legacy'),
      projectionFingerprint: null,
      acceptanceFingerprint: null,
      blueprintId: null,
      blueprintVersion: null,
      projectionVersion: null,
      renderAdapterVersion: null,
      publishedAt,
      fallbackReason: input.fallbackReason ?? null,
      authoritative: false,
    });
  }
  return Object.freeze({
    source: /** @type {const} */ ('projection'),
    projectionFingerprint: input.projectionFingerprint ?? null,
    acceptanceFingerprint: input.acceptanceFingerprint ?? null,
    blueprintId: input.blueprintId ?? null,
    blueprintVersion: input.blueprintVersion ?? null,
    projectionVersion: input.projectionVersion ?? null,
    renderAdapterVersion: input.renderAdapterVersion ?? null,
    publishedAt,
    fallbackReason: null,
    authoritative: false,
  });
}

/**
 * Attach provenance under preview.meta without mutating caller object in place.
 * @param {object} preview
 * @param {ReturnType<typeof buildPublishProvenance>} provenance
 */
export function attachPublishProvenance(preview, provenance) {
  const base = preview && typeof preview === 'object' ? preview : {};
  const meta = base.meta && typeof base.meta === 'object' ? { ...base.meta } : {};
  const website =
    base.website && typeof base.website === 'object'
      ? {
          ...base.website,
          meta: {
            ...(base.website.meta && typeof base.website.meta === 'object' ? base.website.meta : {}),
            designLibraryPublish: provenance,
          },
        }
      : base.website;

  return {
    ...base,
    website,
    meta: {
      ...meta,
      designLibraryPublish: provenance,
    },
  };
}

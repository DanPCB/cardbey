/**
 * Canonical StorefrontProjection result helpers.
 */

export const PROJECTOR_VERSION = 1;
export const PROJECTION_VERSION = 1;

export const PROJECTION_WARNING_CODES = Object.freeze([
  'MISSING_REQUIRED_SECTION_DATA',
  'LOW_CONFIDENCE_CLASSIFICATION',
  'UNMAPPED_CONTENT_ROLE',
  'UNSUPPORTED_BLUEPRINT_ACTION',
  'SECTION_EMPTY_AFTER_FILTERING',
  'OWNER_REVIEW_REQUIRED',
  'SUGGESTED_CONTENT_USED',
  'VALIDATION_FAILED',
]);

/**
 * @typedef {{
 *   code: string,
 *   sectionRole?: string,
 *   itemRef?: string,
 *   detail?: string,
 * }} ProjectionWarning
 *
 * @typedef {{
 *   id: string,
 *   role: string,
 *   variant: string,
 *   priority: number,
 *   itemRefs: string[],
 *   visibility: 'visible'|'collapsed'|'footer_only'|'hidden',
 *   contentOrigin: 'sourced'|'suggested'|'mixed'|'none',
 *   requiresOwnerReview: boolean,
 *   fallbackUsed: boolean,
 *   metadata?: Record<string, unknown>,
 * }} ProjectedStorefrontSection
 *
 * @typedef {{
 *   version: number,
 *   blueprintId: string,
 *   blueprintVersion: number,
 *   businessModel: string,
 *   primaryAction: string,
 *   secondaryActions: string[],
 *   sections: ProjectedStorefrontSection[],
 *   sourceSummary: {
 *     sourcedCount: number,
 *     suggestedCount: number,
 *     pendingReviewCount: number,
 *   },
 *   classificationSummary: Record<string, number>,
 *   warnings: ProjectionWarning[],
 *   authoritative: false,
 *   projectorVersion: number,
 *   metadata?: Record<string, unknown>,
 * }} StorefrontProjection
 */

/**
 * @param {Partial<ProjectedStorefrontSection> & {
 *   id: string,
 *   role: string,
 *   variant: string,
 *   priority: number,
 *   visibility: ProjectedStorefrontSection['visibility'],
 * }} partial
 * @returns {ProjectedStorefrontSection}
 */
export function freezeProjectedSection(partial) {
  return Object.freeze({
    id: String(partial.id),
    role: String(partial.role),
    variant: String(partial.variant),
    priority: Number(partial.priority) || 0,
    itemRefs: Object.freeze([...(partial.itemRefs ?? [])]),
    visibility: partial.visibility,
    contentOrigin: partial.contentOrigin ?? 'none',
    requiresOwnerReview: Boolean(partial.requiresOwnerReview),
    fallbackUsed: Boolean(partial.fallbackUsed),
    ...(partial.metadata
      ? { metadata: Object.freeze({ ...partial.metadata }) }
      : {}),
  });
}

/**
 * @param {ProjectionWarning} w
 */
export function freezeWarning(w) {
  return Object.freeze({
    code: String(w.code),
    ...(w.sectionRole != null ? { sectionRole: String(w.sectionRole) } : {}),
    ...(w.itemRef != null ? { itemRef: String(w.itemRef) } : {}),
    ...(w.detail != null ? { detail: String(w.detail) } : {}),
  });
}

/**
 * @param {StorefrontProjection} projection
 * @returns {StorefrontProjection}
 */
export function freezeStorefrontProjection(projection) {
  return Object.freeze({
    version: PROJECTION_VERSION,
    blueprintId: projection.blueprintId,
    blueprintVersion: projection.blueprintVersion,
    businessModel: projection.businessModel,
    primaryAction: projection.primaryAction,
    secondaryActions: Object.freeze([...(projection.secondaryActions ?? [])]),
    sections: Object.freeze([...(projection.sections ?? [])].map(freezeProjectedSection)),
    sourceSummary: Object.freeze({
      sourcedCount: Number(projection.sourceSummary?.sourcedCount) || 0,
      suggestedCount: Number(projection.sourceSummary?.suggestedCount) || 0,
      pendingReviewCount: Number(projection.sourceSummary?.pendingReviewCount) || 0,
    }),
    classificationSummary: Object.freeze({
      ...(projection.classificationSummary ?? {}),
    }),
    warnings: Object.freeze([...(projection.warnings ?? [])].map(freezeWarning)),
    authoritative: false,
    projectorVersion: PROJECTOR_VERSION,
    ...(projection.metadata
      ? { metadata: Object.freeze({ ...projection.metadata }) }
      : {}),
  });
}

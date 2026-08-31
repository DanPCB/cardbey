/**
 * Shadow comparison result freeze helpers + finding codes.
 */

export const SHADOW_COMPARISON_VERSION = 1;

export const COMPARISON_FINDING_CODES = Object.freeze([
  'SECTION_ADDED',
  'SECTION_REMOVED',
  'SECTION_REORDERED',
  'SECTION_ROLE_CHANGED',
  'SECTION_VISIBILITY_CHANGED',
  'ITEM_MOVED_BETWEEN_SECTIONS',
  'CTA_CHANGED',
  'LEGACY_UNSUPPORTED_SEMANTIC_ROLE',
  'PROJECTED_RENDERER_FALLBACK',
  'POLICY_REMOVED_FROM_CATALOG',
  'CAREER_REMOVED_FROM_CATALOG',
  'TESTIMONIAL_REMOVED_FROM_SERVICES',
  'BOOK_CHANGED_TO_REQUEST_QUOTE',
  'SOURCED_SERVICE_MISSING',
  'PRIMARY_CTA_NO_DESTINATION',
  'FALLBACK_CHANGES_COMMERCE_MEANING',
  'CONTACT_LOST_EVIDENCE',
  'ALL_VISIBLE_SECTIONS_EMPTY',
]);

/**
 * @typedef {{
 *   code: string,
 *   severity: 'info'|'correction'|'warning'|'blocker',
 *   detail?: string,
 *   sectionRole?: string,
 *   legacyValue?: string,
 *   projectedValue?: string,
 * }} ComparisonFinding
 *
 * @typedef {{
 *   version: number,
 *   summary: {
 *     equivalent: boolean,
 *     legacySectionCount: number,
 *     projectedSectionCount: number,
 *     addedSections: number,
 *     removedSections: number,
 *     reorderedSections: number,
 *     CTAChanges: number,
 *     semanticCorrections: number,
 *   },
 *   sectionDiffs: Array<Record<string, unknown>>,
 *   actionDiffs: Array<Record<string, unknown>>,
 *   criticalFindings: ComparisonFinding[],
 *   readiness: {
 *     safeForPreview: boolean,
 *     safeForControlledCutover: boolean,
 *     blockers: string[],
 *     warnings: string[],
 *   },
 *   authoritative: false,
 * }} StorefrontShadowComparison
 */

/**
 * @param {StorefrontShadowComparison} comparison
 */
export function freezeShadowComparison(comparison) {
  return Object.freeze({
    version: SHADOW_COMPARISON_VERSION,
    summary: Object.freeze({ ...comparison.summary }),
    sectionDiffs: Object.freeze([...(comparison.sectionDiffs ?? [])].map((d) => Object.freeze({ ...d }))),
    actionDiffs: Object.freeze([...(comparison.actionDiffs ?? [])].map((d) => Object.freeze({ ...d }))),
    criticalFindings: Object.freeze(
      [...(comparison.criticalFindings ?? [])].map((f) => Object.freeze({ ...f })),
    ),
    readiness: Object.freeze({
      safeForPreview: Boolean(comparison.readiness?.safeForPreview),
      safeForControlledCutover: Boolean(comparison.readiness?.safeForControlledCutover),
      blockers: Object.freeze([...(comparison.readiness?.blockers ?? [])]),
      warnings: Object.freeze([...(comparison.readiness?.warnings ?? [])]),
    }),
    authoritative: false,
  });
}

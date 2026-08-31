/**
 * Build a full advisory StorefrontProjection from evidence + selected blueprint.
 */

import {
  freezeStorefrontProjection,
  PROJECTOR_VERSION,
  PROJECTION_VERSION,
} from './projectionResult.js';
import {
  projectBlueprintSection,
  projectPoliciesSection,
  enrichFooterSection,
} from './sectionProjector.js';
import { mapContentRoleToSection } from './contentRoleMapper.js';

/**
 * @param {import('./projectionEvidence.js').ProjectionEvidence} evidence
 * @returns {import('./projectionResult.js').StorefrontProjection}
 */
export function projectStorefront(evidence) {
  /** @type {import('./projectionResult.js').ProjectionWarning[]} */
  const warnings = [];
  const blueprint = evidence.blueprint;

  if (
    evidence.primaryAction &&
    !blueprint.supportedActions.includes(evidence.primaryAction)
  ) {
    warnings.push({
      code: 'UNSUPPORTED_BLUEPRINT_ACTION',
      detail: evidence.primaryAction,
    });
  }

  /** @type {import('./projectionResult.js').ProjectedStorefrontSection[]} */
  const sections = [];

  for (const sectionDef of blueprint.defaultSections) {
    let projected = projectBlueprintSection(sectionDef, evidence, warnings);
    if (projected.role === 'footer') {
      projected = enrichFooterSection(projected, evidence);
    }
    sections.push(projected);
  }

  // Policies: always footer_only when policy rows exist (may be synthetic)
  const hasPoliciesSection = sections.some((s) => s.role === 'policies');
  if (!hasPoliciesSection) {
    const policies = projectPoliciesSection(evidence, warnings);
    if (policies) sections.push(policies);
  }

  // Navigation: intentionally omitted (hidden)
  // Unknown: collapsed review bucket in metadata (not a public section role)
  const unknownItems = evidence.items.filter((i) => i.contentRole === 'unknown');
  /** @type {Record<string, unknown>} */
  const metadata = {
    themeId: evidence.themeId,
    previewSampleId: evidence.previewSampleId,
  };
  if (unknownItems.length) {
    metadata.unknownReviewBucket = Object.freeze({
      visibility: 'collapsed',
      requiresOwnerReview: true,
      itemRefs: Object.freeze(unknownItems.map((i) => i.ref)),
    });
    warnings.push({
      code: 'UNMAPPED_CONTENT_ROLE',
      detail: `${unknownItems.length} unknown item(s) in review bucket`,
    });
    warnings.push({ code: 'OWNER_REVIEW_REQUIRED', detail: 'unknown_review_bucket' });
  }

  // Warn for content roles that map nowhere and aren't navigation/unknown/handled
  for (const item of evidence.items) {
    if (item.contentRole === 'navigation' || item.contentRole === 'unknown') continue;
    if (item.contentRole === 'policy' || item.contentRole === 'career' || item.contentRole === 'blog' || item.contentRole === 'support') {
      continue;
    }
    const mapped = mapContentRoleToSection(item.contentRole, {
      hasServiceAreaSection: sections.some((s) => s.role === 'service_area'),
      hasLocationSection: sections.some((s) => s.role === 'location'),
    });
    if (!mapped) {
      warnings.push({
        code: 'UNMAPPED_CONTENT_ROLE',
        itemRef: item.ref,
        detail: item.contentRole,
      });
      continue;
    }
    const targetExists = sections.some((s) => s.role === mapped || (mapped === 'policies' && s.role === 'policies'));
    if (!targetExists && mapped !== 'policies' && mapped !== 'footer' && mapped !== '_unknown_review') {
      // Content role maps to a section the blueprint lacks — note it
      warnings.push({
        code: 'UNMAPPED_CONTENT_ROLE',
        itemRef: item.ref,
        sectionRole: mapped,
        detail: `blueprint lacks section ${mapped}`,
      });
    }
  }

  const sourceSummary = summarizeSources(evidence.items);

  // Stable sort by priority then id
  sections.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });

  return freezeStorefrontProjection({
    version: PROJECTION_VERSION,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    businessModel: evidence.businessModel,
    primaryAction: evidence.primaryAction,
    secondaryActions: evidence.secondaryActions,
    sections,
    sourceSummary,
    classificationSummary: evidence.roleCounts,
    warnings: dedupeWarnings(warnings),
    authoritative: false,
    projectorVersion: PROJECTOR_VERSION,
    metadata,
  });
}

/**
 * @param {import('./projectionEvidence.js').ProjectionItem[]} items
 */
function summarizeSources(items) {
  let sourcedCount = 0;
  let suggestedCount = 0;
  let pendingReviewCount = 0;
  for (const i of items) {
    if (i.contentOrigin === 'suggested') suggestedCount += 1;
    else if (i.contentOrigin === 'sourced') sourcedCount += 1;
    if (i.needsOwnerReview) pendingReviewCount += 1;
  }
  return { sourcedCount, suggestedCount, pendingReviewCount };
}

/**
 * @param {import('./projectionResult.js').ProjectionWarning[]} warnings
 */
function dedupeWarnings(warnings) {
  const seen = new Set();
  /** @type {import('./projectionResult.js').ProjectionWarning[]} */
  const out = [];
  for (const w of warnings) {
    const key = `${w.code}|${w.sectionRole ?? ''}|${w.itemRef ?? ''}|${w.detail ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/**
 * Validate advisory StorefrontProjection before attach.
 */

import { isSectionRole } from '../contracts/sectionRole.js';
import { getBlueprint } from '../registries/index.js';
import { OFFERING_SECTION_ROLES } from './contentRoleMapper.js';
import { VARIANT_CATALOG } from './sectionVariantSelector.js';

const SYNTHETIC_ALLOWED_ROLES = new Set(['policies']);

/**
 * @typedef {{
 *   ok: boolean,
 *   errors: string[],
 * }} ProjectionValidationResult
 */

/**
 * @param {import('./projectionResult.js').StorefrontProjection | null | undefined} projection
 * @param {{ itemsByRef?: Map<string, unknown>, strict?: boolean }} [opts]
 * @returns {ProjectionValidationResult}
 */
export function validateStorefrontProjection(projection, opts = {}) {
  /** @type {string[]} */
  const errors = [];

  if (!projection || typeof projection !== 'object') {
    return { ok: false, errors: ['projection_missing'] };
  }

  if (projection.authoritative !== false) {
    errors.push('authoritative_must_be_false');
  }
  if (!Number.isFinite(projection.version) || projection.version < 1) {
    errors.push('projection_version_missing');
  }
  if (!Number.isFinite(projection.projectorVersion) || projection.projectorVersion < 1) {
    errors.push('projector_version_missing');
  }
  if (!projection.blueprintId) {
    errors.push('blueprint_id_missing');
  }

  const blueprint = getBlueprint(projection.blueprintId);
  if (!blueprint) {
    errors.push(`unknown_blueprint:${projection.blueprintId}`);
    return { ok: false, errors };
  }

  if (
    projection.primaryAction &&
    !blueprint.supportedActions.includes(projection.primaryAction)
  ) {
    // Soft: already warned in projection; only hard-fail in strict mode
    if (opts.strict) {
      errors.push(`primary_action_unsupported:${projection.primaryAction}`);
    }
  }

  const blueprintRoles = new Set(blueprint.defaultSections.map((s) => s.role));
  const ids = new Set();

  for (const section of projection.sections ?? []) {
    if (!section?.id) {
      errors.push('section_missing_id');
      continue;
    }
    if (ids.has(section.id)) {
      errors.push(`duplicate_section_id:${section.id}`);
    }
    ids.add(section.id);

    if (!Number.isFinite(section.priority)) {
      errors.push(`priority_not_numeric:${section.id}`);
    }

    if (!isSectionRole(section.role) && !SYNTHETIC_ALLOWED_ROLES.has(section.role)) {
      errors.push(`invalid_section_role:${section.role}`);
    }

    if (!blueprintRoles.has(section.role) && !SYNTHETIC_ALLOWED_ROLES.has(section.role)) {
      errors.push(`section_not_in_blueprint:${section.role}`);
    }

    const def = blueprint.defaultSections.find((s) => s.role === section.role);
    const supported = def
      ? new Set([
          ...def.supportedVariants,
          ...(VARIANT_CATALOG[section.role] ?? []),
        ])
      : new Set(VARIANT_CATALOG[section.role] ?? ['default', 'link-list']);
    if (section.variant && !supported.has(section.variant)) {
      errors.push(`variant_unsupported:${section.role}:${section.variant}`);
    }

    // Placement rules: policies/career/navigation never in offering sections as content
    if (OFFERING_SECTION_ROLES.includes(section.role)) {
      for (const ref of section.itemRefs ?? []) {
        const item = opts.itemsByRef?.get(ref);
        const contentRole = item?.contentRole;
        if (
          contentRole === 'policy' ||
          contentRole === 'career' ||
          contentRole === 'navigation' ||
          contentRole === 'testimonial'
        ) {
          errors.push(`forbidden_item_in_offering:${section.role}:${ref}:${contentRole}`);
        }
      }
    }

    if (section.role === 'policies' && section.visibility !== 'footer_only' && section.visibility !== 'hidden') {
      // Prefer footer_only; allow hidden
      if (section.visibility === 'visible') {
        errors.push('policies_must_not_be_main_visible');
      }
    }

    if (opts.itemsByRef) {
      for (const ref of section.itemRefs ?? []) {
        if (!opts.itemsByRef.has(ref)) {
          errors.push(`missing_item_ref:${ref}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

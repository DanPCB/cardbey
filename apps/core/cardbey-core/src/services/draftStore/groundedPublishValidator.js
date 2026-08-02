/**
 * Phase 5 — Publish validator for grounded store creation.
 * Runs immediately before publish. Classifies issues as blocking | warning | suggestion.
 *
 * Not everything blocks. Suggested-only catalogue blocks treating inventory as fact,
 * but identity-ready presentation drafts may still proceed with warnings when allowed.
 */

import { isGroundedStoreCreationEnabled } from './groundedStoreCreation.js';
import {
  buildContentReadinessModel,
  applyContentReadinessToCatalog,
} from './contentReadinessModel.js';

/** @typedef {'blocking'|'warning'|'suggestion'} IssueSeverity */

/**
 * @typedef {object} PublishIssue
 * @property {IssueSeverity} severity
 * @property {string} code
 * @property {string} message
 * @property {string} [area]
 */

/**
 * @typedef {object} GroundedPublishValidation
 * @property {'ready'|'needs_attention'|'blocked'} status
 * @property {PublishIssue[]} blockingIssues
 * @property {PublishIssue[]} warnings
 * @property {PublishIssue[]} suggestions
 * @property {object} contentReadiness
 * @property {boolean} canPublish
 */

/**
 * @param {object} preview
 * @param {{ force?: boolean }} [opts] - force=true runs even when flag off (tests)
 * @returns {GroundedPublishValidation|null} null when grounded flag off
 */
export function validateGroundedDraftForPublish(preview, opts = {}) {
  if (!opts.force && !isGroundedStoreCreationEnabled()) return null;

  const stamped = applyContentReadinessToCatalog({
    ...(preview && typeof preview === 'object' ? preview : {}),
    items: Array.isArray(preview?.items) ? preview.items : [],
    meta: preview?.meta && typeof preview.meta === 'object' ? preview.meta : {},
  });
  const contentReadiness = stamped.meta?.contentReadiness || buildContentReadinessModel(preview || {});

  /** @type {PublishIssue[]} */
  const blockingIssues = [];
  /** @type {PublishIssue[]} */
  const warnings = [];
  /** @type {PublishIssue[]} */
  const suggestions = [];

  if (contentReadiness.identity.state === 'blocked') {
    blockingIssues.push({
      severity: 'blocking',
      code: 'missing_identity',
      message: 'Store name is required before publishing.',
      area: 'identity',
    });
  }

  if (contentReadiness.catalogue.state === 'missing') {
    // Presentation-only draft: warn, do not block identity publish of empty accurate store.
    warnings.push({
      severity: 'warning',
      code: 'catalogue_missing',
      message: 'No verified products or services — store will publish as a business profile without inventory.',
      area: 'catalogue',
    });
  }

  if (contentReadiness.catalogue.state === 'suggested_only') {
    blockingIssues.push({
      severity: 'blocking',
      code: 'suggested_only_catalogue',
      message: 'Catalogue is suggestion-only. Accept, edit, or remove suggested items before publishing inventory.',
      area: 'catalogue',
    });
  }

  if (contentReadiness.catalogue.state === 'needs_review') {
    blockingIssues.push({
      severity: 'blocking',
      code: 'unreviewed_catalogue',
      message: 'Some sourced or suggested items still need owner review.',
      area: 'catalogue',
    });
  }

  if (contentReadiness.media.state === 'needs_media') {
    const heroMissing = contentReadiness.ownerReviewSummary?.heroRequired;
    if (heroMissing) {
      warnings.push({
        severity: 'warning',
        code: 'missing_hero',
        message: 'Hero image needed — upload a hero or choose from your media library.',
        area: 'media',
      });
    }
    if ((contentReadiness.ownerReviewSummary?.imagesMissing || 0) > 0) {
      warnings.push({
        severity: 'warning',
        code: 'missing_product_images',
        message: `${contentReadiness.ownerReviewSummary.imagesMissing} item image(s) missing — cards will show “Image required”.`,
        area: 'media',
      });
    }
    if (contentReadiness.media.issues?.some((i) => /logo/i.test(i))) {
      warnings.push({
        severity: 'warning',
        code: 'missing_logo',
        message: 'Logo needed for a complete brand presence.',
        area: 'branding',
      });
    }
  }

  if (contentReadiness.contact.state === 'missing') {
    warnings.push({
      severity: 'warning',
      code: 'missing_contact',
      message: 'Contact details needed so customers can reach you.',
      area: 'contact',
    });
  } else if (contentReadiness.contact.state === 'needs_review') {
    suggestions.push({
      severity: 'suggestion',
      code: 'partial_contact',
      message: 'Add phone, email, or address to improve trust.',
      area: 'contact',
    });
  }

  // Low media confidence on hero
  const heroTruth = contentReadiness.heroTruth;
  if (
    heroTruth &&
    typeof heroTruth.mediaMatchScore === 'number' &&
    heroTruth.mediaMatchScore < 0.55 &&
    heroTruth.mediaStatus !== 'needs_media'
  ) {
    warnings.push({
      severity: 'warning',
      code: 'low_media_confidence',
      message: 'Hero media match confidence is low — confirm or replace before going live.',
      area: 'media',
    });
  }

  if (contentReadiness.policies.state === 'missing') {
    suggestions.push({
      severity: 'suggestion',
      code: 'policies_missing',
      message: 'Add store policies when ready.',
      area: 'policies',
    });
  }

  if (contentReadiness.seo.state === 'missing') {
    suggestions.push({
      severity: 'suggestion',
      code: 'seo_missing',
      message: 'SEO fields are incomplete.',
      area: 'seo',
    });
  }

  const status =
    blockingIssues.length > 0
      ? 'blocked'
      : warnings.length > 0 || contentReadiness.overall === 'needs_attention'
        ? 'needs_attention'
        : 'ready';

  return {
    status,
    blockingIssues,
    warnings,
    suggestions,
    contentReadiness,
    canPublish: blockingIssues.length === 0,
  };
}

/**
 * Throw-friendly guard for publishDraftService.
 * @param {object} preview
 * @returns {GroundedPublishValidation|null}
 */
export function assertGroundedPublishAllowed(preview) {
  const result = validateGroundedDraftForPublish(preview);
  if (!result) return null;
  if (!result.canPublish) {
    const err = new Error(
      result.blockingIssues.map((i) => i.message).join(' ') || 'Draft needs attention before publishing.',
    );
    err.code = 'grounded_publish_blocked';
    err.status = 409;
    err.validation = result;
    throw err;
  }
  return result;
}

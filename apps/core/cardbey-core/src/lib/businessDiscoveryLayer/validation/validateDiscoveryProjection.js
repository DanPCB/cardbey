/**
 * Discovery validation pipeline:
 * Business → Language → Translation → Required fields → Slug → Media → Publishable?
 */

import { isBusinessDiscoveryValidationV1Enabled } from '../flags.js';
import {
  buildDiscoveryValidationResult,
  discoveryIssue,
} from '../contracts/discoveryValidation.js';
import { assertBusinessDiscoveryProjection } from '../contracts/discoveryProjection.js';

/**
 * @param {import('../contracts/discoveryProjection.js').BusinessDiscoveryProjection|object} projection
 * @param {object} [opts]
 * @param {boolean} [opts.requireTranslationApproval]
 * @param {boolean} [opts.requireHeroMedia]
 * @returns {import('../contracts/discoveryValidation.js').DiscoveryValidationResult | { publishable: false, status: string, reason: string }}
 */
export function validateDiscoveryProjection(projection, opts = {}) {
  if (!isBusinessDiscoveryValidationV1Enabled()) {
    return {
      status: 'blocked',
      publishable: false,
      reason: 'business_discovery_validation_disabled',
      issues: [],
      stages: { blocked: true },
      evaluatedAt: new Date().toISOString(),
    };
  }

  const issues = [];
  const stages = {
    businessValid: false,
    languageValid: false,
    translationApproved: false,
    requiredFieldsPresent: false,
    slugValid: false,
    mediaValid: false,
    publishable: false,
    blocked: false,
  };

  let proj;
  try {
    proj = assertBusinessDiscoveryProjection(projection);
  } catch (err) {
    issues.push(
      discoveryIssue(
        'projection_invalid',
        'business',
        err instanceof Error ? err.message : String(err),
      ),
    );
    stages.blocked = true;
    return buildDiscoveryValidationResult({ issues, stages });
  }

  // 1. Business valid
  if (!proj.businessId) {
    issues.push(discoveryIssue('missing_business_id', 'business', 'businessId is required'));
  }
  if (!proj.name || !proj.name.trim()) {
    issues.push(discoveryIssue('missing_name', 'business', 'Business name is required'));
  }
  if (proj.status === 'inactive') {
    issues.push(
      discoveryIssue('business_inactive', 'business', 'Business is inactive', 'warning'),
    );
  }
  stages.businessValid = !issues.some((i) => i.stage === 'business' && i.severity === 'error');

  // 2. Language valid
  const primary = proj.languages?.primaryLanguage;
  if (!primary || typeof primary !== 'string') {
    issues.push(
      discoveryIssue('missing_primary_language', 'language', 'primaryLanguage is required'),
    );
  }
  if (!Array.isArray(proj.languages?.availableLanguages) || !proj.languages.availableLanguages.length) {
    issues.push(
      discoveryIssue(
        'missing_available_languages',
        'language',
        'availableLanguages must be non-empty',
      ),
    );
  }
  stages.languageValid = !issues.some((i) => i.stage === 'language' && i.severity === 'error');

  // 3. Translation approved (optional gate for multilingual discovery publish)
  const requireApproval = Boolean(opts.requireTranslationApproval);
  if (requireApproval && !proj.languages.translationApprovedForDiscovery) {
    issues.push(
      discoveryIssue(
        'translation_not_approved',
        'translation',
        'Translation approval required for discovery publish',
      ),
    );
  }
  stages.translationApproved =
    !requireApproval || Boolean(proj.languages.translationApprovedForDiscovery);

  // 4. Required fields
  const desc =
    proj.business?.shortDescription ||
    proj.business?.description ||
    proj.discoveryMetadata?.description;
  if (!desc) {
    issues.push(
      discoveryIssue(
        'missing_description',
        'required_fields',
        'Description required for discovery',
        'warning',
      ),
    );
  }
  if (!proj.discoveryMetadata?.title && !proj.name) {
    issues.push(
      discoveryIssue('missing_title', 'required_fields', 'Discovery title required'),
    );
  }
  stages.requiredFieldsPresent = !issues.some(
    (i) => i.stage === 'required_fields' && i.severity === 'error',
  );

  // 5. Slug valid
  const slug = proj.slug;
  if (!slug) {
    issues.push(discoveryIssue('missing_slug', 'slug', 'Public slug is required'));
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    issues.push(discoveryIssue('invalid_slug', 'slug', `Slug format invalid: ${slug}`));
  }
  stages.slugValid = !issues.some((i) => i.stage === 'slug' && i.severity === 'error');

  // 6. Media valid
  const hasLogo = Boolean(proj.media?.logoUrl);
  const hasHero = Boolean(proj.media?.heroImageUrl || proj.media?.heroVideoUrl);
  if (!hasLogo && !hasHero) {
    issues.push(
      discoveryIssue(
        'missing_media',
        'media',
        'At least logo or hero media recommended',
        opts.requireHeroMedia ? 'error' : 'warning',
      ),
    );
  }
  stages.mediaValid = !issues.some((i) => i.stage === 'media' && i.severity === 'error');

  stages.publishable =
    stages.businessValid &&
    stages.languageValid &&
    stages.translationApproved &&
    stages.requiredFieldsPresent &&
    stages.slugValid &&
    stages.mediaValid;

  return buildDiscoveryValidationResult({ issues, stages });
}

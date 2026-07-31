/**
 * Storefront Design Library — Phases 1–5
 *
 * Contracts + registries + classification + commerce policy + blueprint scoring
 * + advisory storefront section projection.
 * Not authoritative for store generation or rendering.
 *
 * Naming in this bounded context (avoid ambiguous "templateId"):
 * - contentTemplateId
 * - visualThemeId
 * - blueprintId
 * - previewSampleId
 * - legacyThemeTemplateId  (= website.theme.templateId)
 */

export * from './contracts/index.js';
export * from './registries/index.js';
export * from './adapters/index.js';
export * from './classification/index.js';
export * from './policy/index.js';
export * from './scoring/index.js';
export * from './projection/index.js';
export { isDesignLibraryV1Enabled, isDesignLibraryAuthoritative } from './flags.js';

import { isDesignLibraryV1Enabled, isDesignLibraryAuthoritative } from './flags.js';
import {
  listBlueprints,
  listVisualThemes,
  listPreviewSamples,
} from './registries/index.js';
import { BUSINESS_MODEL_POLICY_VERSION, CTA_POLICY_VERSION } from './policy/index.js';
import { SCORER_VERSION } from './scoring/scoringWeights.js';
import { PROJECTOR_VERSION } from './projection/projectionResult.js';

/**
 * Safe diagnostic snapshot. Empty when flag off (callers should not depend on it for authority).
 */
export function getDesignLibraryDiagnostics() {
  if (!isDesignLibraryV1Enabled()) {
    return Object.freeze({
      enabled: false,
      authoritative: false,
      blueprintCount: 0,
      themeCount: 0,
      previewSampleCount: 0,
      commercePolicyVersion: null,
      businessModelPolicyVersion: null,
      scorerVersion: null,
      projectorVersion: null,
    });
  }
  return Object.freeze({
    enabled: true,
    authoritative: isDesignLibraryAuthoritative(),
    blueprintCount: listBlueprints().length,
    themeCount: listVisualThemes().length,
    previewSampleCount: listPreviewSamples().length,
    blueprintIds: listBlueprints().map((b) => b.id),
    themeIds: listVisualThemes().map((t) => t.id),
    previewSampleIds: listPreviewSamples().map((p) => p.id),
    commercePolicyVersion: CTA_POLICY_VERSION,
    businessModelPolicyVersion: BUSINESS_MODEL_POLICY_VERSION,
    scorerVersion: SCORER_VERSION,
    projectorVersion: PROJECTOR_VERSION,
  });
}

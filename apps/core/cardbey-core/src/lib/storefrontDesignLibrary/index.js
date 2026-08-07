/**
 * Storefront Design Library — Phases 1–8B-Core
 *
 * Contracts + registries + classification + commerce policy + blueprint scoring
 * + advisory section projection + shadow render comparison / preview adapter
 * + per-draft owner acceptance + authorised preview render + controlled publish cutover
 * + optional per-draft projection renderer cutover (renderCutover/).
 * Not authoritative for global store generation or public rendering.
 *
 * Naming in this bounded context (avoid ambiguous "templateId"):
 * - contentTemplateId
 * - visualThemeId
 * - blueprintId
 * - previewSampleId
 * - legacyThemeTemplateId  (= website.theme.templateId)
 *
 * previewRendering/ is preview-only — public/publish must not import it.
 */

export * from './contracts/index.js';
export * from './registries/index.js';
export * from './adapters/index.js';
export * from './classification/index.js';
export * from './policy/index.js';
export * from './scoring/index.js';
export * from './projection/index.js';
export * from './rendering/index.js';
export * from './acceptance/index.js';
// previewRendering/ + publishCutover/ + renderCutover/ are intentionally NOT re-exported here —
// import from those paths only (auth draft preview / draft-store publish / live render).
export {
  isDesignLibraryV1Enabled,
  isDesignLibraryAuthoritative,
  isStorefrontProjectionShadowEnabled,
  isStorefrontProjectionPreviewEnabled,
  isStorefrontProjectionAcceptanceEnabled,
  isStorefrontProjectionPreviewRenderEnabled,
  isStorefrontProjectionPublishEnabled,
  isStorefrontProjectionRenderCutoverEnabled,
} from './flags.js';

import {
  isDesignLibraryV1Enabled,
  isDesignLibraryAuthoritative,
  isStorefrontProjectionShadowEnabled,
  isStorefrontProjectionPreviewEnabled,
  isStorefrontProjectionAcceptanceEnabled,
  isStorefrontProjectionPreviewRenderEnabled,
  isStorefrontProjectionPublishEnabled,
  isStorefrontProjectionRenderCutoverEnabled,
} from './flags.js';
import {
  listBlueprints,
  listVisualThemes,
  listPreviewSamples,
} from './registries/index.js';
import { BUSINESS_MODEL_POLICY_VERSION, CTA_POLICY_VERSION } from './policy/index.js';
import { SCORER_VERSION } from './scoring/scoringWeights.js';
import { PROJECTOR_VERSION } from './projection/projectionResult.js';
import { ADAPTER_VERSION, COMPARISON_VERSION } from './rendering/renderCompatibility.js';
import { ACCEPTANCE_VERSION } from './acceptance/acceptanceRecord.js';

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
      shadowEnabled: false,
      previewEnabled: false,
      acceptanceEnabled: false,
      previewRenderEnabled: false,
      publishEnabled: false,
      renderCutoverEnabled: false,
      adapterVersion: null,
      comparisonVersion: null,
      acceptanceVersion: null,
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
    shadowEnabled: isStorefrontProjectionShadowEnabled(),
    previewEnabled: isStorefrontProjectionPreviewEnabled(),
    acceptanceEnabled: isStorefrontProjectionAcceptanceEnabled(),
    previewRenderEnabled: isStorefrontProjectionPreviewRenderEnabled(),
    publishEnabled: isStorefrontProjectionPublishEnabled(),
    renderCutoverEnabled: isStorefrontProjectionRenderCutoverEnabled(),
    adapterVersion: ADAPTER_VERSION,
    comparisonVersion: COMPARISON_VERSION,
    acceptanceVersion: ACCEPTANCE_VERSION,
  });
}

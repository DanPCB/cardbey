/**
 * Read-only adapter: ContentTemplate / ContentTemplateVersion → preview-sample metadata.
 *
 * Naming:
 * - contentTemplateId = ContentTemplate.id (DB) or slug logical id
 * - legacyThemeTemplateId = website.theme.templateId enum (NOT contentTemplateId)
 * - visualThemeId / blueprintId / previewSampleId = design-library ids
 *
 * Does not mutate templates. Sample content always disposable.
 */

import { SAMPLE_CONTENT_POLICY_DISPOSABLE } from '../contracts/previewSample.js';
import { mapLegacyThemeTemplateIdToVisualThemeId } from './legacyThemeAdapter.js';
import { adaptLayoutDefinitionToStructuralMetadata } from './websiteTemplateFoundationAdapter.js';
import { getPreviewSample, listPreviewSamples } from '../registries/index.js';

/**
 * Suggest previewSampleId from ContentTemplate slug.
 * @param {string} slug
 */
export function suggestPreviewSampleIdFromTemplateSlug(slug) {
  const s = String(slug ?? '').trim().toLowerCase();
  /** @type {Record<string, string>} */
  const MAP = {
    'beauty-wellness-website': 'beauty-and-wellness',
    'restaurant-cafe-website': 'restaurant-and-cafe',
    'retail-store-website': 'retail-store',
    'trades-home-services-website': 'trades-and-services',
    'minimal-seller-storefront': 'retail-store',
    'professional-services-website': 'trades-and-services',
  };
  return MAP[s] ?? null;
}

/**
 * @param {{
 *   id?: string | null,
 *   slug?: string | null,
 *   name?: string | null,
 *   description?: string | null,
 *   industry?: string | null,
 *   tags?: string[] | null,
 *   contentType?: string | null,
 * }} template
 * @param {{
 *   themeDefinition?: Record<string, unknown> | null,
 *   layoutDefinition?: Record<string, unknown> | null,
 *   versionNumber?: number | null,
 * } | null} [version]
 */
export function adaptContentTemplateToPreviewSample(template, version = null) {
  const contentTemplateId =
    (typeof template?.id === 'string' && template.id.trim()) ||
    (typeof template?.slug === 'string' && template.slug.trim()) ||
    '';
  const slug = typeof template?.slug === 'string' ? template.slug.trim() : '';
  const previewSampleId = suggestPreviewSampleIdFromTemplateSlug(slug);
  const registered = previewSampleId ? getPreviewSample(previewSampleId) : null;

  const themeDefinition =
    version?.themeDefinition && typeof version.themeDefinition === 'object'
      ? version.themeDefinition
      : {};
  const legacyThemeTemplateId = String(
    themeDefinition.templateId ?? themeDefinition.legacyTemplateId ?? themeDefinition.style ?? '',
  ).trim();
  const visualThemeId =
    mapLegacyThemeTemplateIdToVisualThemeId(legacyThemeTemplateId) ||
    registered?.themeId ||
    null;

  const structural = adaptLayoutDefinitionToStructuralMetadata(version?.layoutDefinition ?? null);

  return Object.freeze({
    /** Design-library preview sample id when known */
    previewSampleId: registered?.id ?? previewSampleId,
    /** ContentTemplate.id or slug — NOT website.theme.templateId */
    contentTemplateId: contentTemplateId || null,
    sourceTemplateId: contentTemplateId || slug || null,
    sourceTemplateSlug: slug || null,
    blueprintId: registered?.blueprintId ?? null,
    themeId: visualThemeId,
    /** Persisted enum on website.theme.templateId */
    legacyThemeTemplateId: legacyThemeTemplateId || null,
    name: typeof template?.name === 'string' ? template.name : registered?.name ?? slug,
    description: typeof template?.description === 'string' ? template.description : undefined,
    industry: typeof template?.industry === 'string' ? template.industry : undefined,
    tags: Array.isArray(template?.tags) ? [...template.tags] : registered?.tags ? [...registered.tags] : [],
    sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
    sampleBusiness: Object.freeze({
      ...(registered?.sampleBusiness ? { ...registered.sampleBusiness } : {}),
      __disposableDemo: true,
      __fromContentTemplate: true,
    }),
    legacyLayout: Object.freeze(structural),
    themeDefinitionTokens: Object.freeze({
      primaryColor: themeDefinition.primaryColor ?? themeDefinition.primary ?? null,
      secondaryColor: themeDefinition.secondaryColor ?? themeDefinition.secondary ?? null,
      fontFamily: themeDefinition.fontFamily ?? null,
      legacyThemeTemplateId: legacyThemeTemplateId || null,
    }),
    metadata: Object.freeze({
      contentType: template?.contentType ?? null,
      versionNumber: version?.versionNumber ?? null,
      matchedRegisteredPreview: Boolean(registered),
    }),
  });
}

/**
 * List registered preview samples that declare a sourceTemplateId / slug match.
 * @param {string} contentTemplateSlug
 */
export function findPreviewSamplesForContentTemplateSlug(contentTemplateSlug) {
  const slug = String(contentTemplateSlug ?? '').trim();
  if (!slug) return [];
  return listPreviewSamples().filter(
    (s) => s.sourceTemplateId === slug || s.metadata?.sourceTemplateSlug === slug,
  );
}

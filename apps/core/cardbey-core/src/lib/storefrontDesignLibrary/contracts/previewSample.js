/**
 * StorefrontPreviewSample contract — disposable demo design example.
 *
 * Invariant: sample facts are NEVER authoritative.
 * sampleContentPolicy must be "disposable_demo_only".
 *
 * Naming:
 * - previewSampleId
 * - blueprintId / themeId references
 * - sourceTemplateId = ContentTemplate identity (not legacyThemeTemplateId)
 */

export const SAMPLE_CONTENT_POLICY_DISPOSABLE = 'disposable_demo_only';

/**
 * @typedef {Object} StorefrontPreviewSample
 * @property {string} id
 * @property {number} version
 * @property {string} name
 * @property {string} [description]
 * @property {string} blueprintId
 * @property {string} themeId
 * @property {Record<string, unknown>} sampleBusiness
 * @property {Array<Record<string, unknown>>} [sampleMedia]
 * @property {string[]} tags
 * @property {string[]} recommendedBusinessModels
 * @property {string} [sourceTemplateId]
 * @property {'disposable_demo_only'} sampleContentPolicy
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @param {unknown} raw
 * @returns {StorefrontPreviewSample}
 */
export function assertStorefrontPreviewSample(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[storefrontDesignLibrary] PreviewSample must be an object');
  }
  const p = /** @type {Record<string, unknown>} */ (raw);
  if (typeof p.id !== 'string' || !p.id.trim()) {
    throw new Error('[storefrontDesignLibrary] PreviewSample id is required');
  }
  if (typeof p.version !== 'number' || !Number.isInteger(p.version) || p.version < 1) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" version must be an integer >= 1`);
  }
  if (typeof p.name !== 'string' || !p.name.trim()) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" name is required`);
  }
  if (typeof p.blueprintId !== 'string' || !p.blueprintId.trim()) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" blueprintId is required`);
  }
  if (typeof p.themeId !== 'string' || !p.themeId.trim()) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" themeId is required`);
  }
  if (!p.sampleBusiness || typeof p.sampleBusiness !== 'object' || Array.isArray(p.sampleBusiness)) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" sampleBusiness object is required`);
  }
  if (!Array.isArray(p.tags)) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" tags must be an array`);
  }
  if (!Array.isArray(p.recommendedBusinessModels)) {
    throw new Error(`[storefrontDesignLibrary] PreviewSample "${p.id}" recommendedBusinessModels must be an array`);
  }
  const policy = p.sampleContentPolicy ?? SAMPLE_CONTENT_POLICY_DISPOSABLE;
  if (policy !== SAMPLE_CONTENT_POLICY_DISPOSABLE) {
    throw new Error(
      `[storefrontDesignLibrary] PreviewSample "${p.id}" sampleContentPolicy must be "${SAMPLE_CONTENT_POLICY_DISPOSABLE}"`,
    );
  }
  return Object.freeze({
    id: p.id.trim(),
    version: p.version,
    name: String(p.name).trim(),
    description: typeof p.description === 'string' ? p.description : undefined,
    blueprintId: String(p.blueprintId).trim(),
    themeId: String(p.themeId).trim(),
    sampleBusiness: Object.freeze({
      .../** @type {Record<string, unknown>} */ (p.sampleBusiness),
      __disposableDemo: true,
    }),
    sampleMedia: Array.isArray(p.sampleMedia)
      ? Object.freeze(p.sampleMedia.map((m) => Object.freeze({ ...m })))
      : undefined,
    tags: Object.freeze([...p.tags]),
    recommendedBusinessModels: Object.freeze([...p.recommendedBusinessModels]),
    sourceTemplateId: typeof p.sourceTemplateId === 'string' ? p.sourceTemplateId.trim() : undefined,
    sampleContentPolicy: SAMPLE_CONTENT_POLICY_DISPOSABLE,
    metadata:
      p.metadata && typeof p.metadata === 'object' && !Array.isArray(p.metadata)
        ? Object.freeze({ .../** @type {object} */ (p.metadata) })
        : undefined,
  });
}

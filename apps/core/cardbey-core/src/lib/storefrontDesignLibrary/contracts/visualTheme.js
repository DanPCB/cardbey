/**
 * VisualTheme contract — appearance only.
 *
 * Naming: visualThemeId (never ambiguous "templateId").
 * Does not decide sections, CTAs, or business facts.
 */

/**
 * @typedef {Object} VisualTheme
 * @property {string} id
 * @property {number} version
 * @property {string} name
 * @property {string} [description]
 * @property {{
 *   palette?: Record<string, unknown>,
 *   typography?: Record<string, unknown>,
 *   spacing?: Record<string, unknown>,
 *   radius?: Record<string, unknown>,
 *   shadow?: Record<string, unknown>,
 *   motion?: Record<string, unknown>,
 * }} tokens
 * @property {Record<string, string>} [componentVariants]
 * @property {string[]} [supportedBlueprints]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @param {unknown} raw
 * @returns {VisualTheme}
 */
export function assertVisualTheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[storefrontDesignLibrary] VisualTheme must be an object');
  }
  const t = /** @type {Record<string, unknown>} */ (raw);
  if (typeof t.id !== 'string' || !t.id.trim()) {
    throw new Error('[storefrontDesignLibrary] VisualTheme id is required');
  }
  if (typeof t.version !== 'number' || !Number.isInteger(t.version) || t.version < 1) {
    throw new Error(`[storefrontDesignLibrary] VisualTheme "${t.id}" version must be an integer >= 1`);
  }
  if (typeof t.name !== 'string' || !t.name.trim()) {
    throw new Error(`[storefrontDesignLibrary] VisualTheme "${t.id}" name is required`);
  }
  if (!t.tokens || typeof t.tokens !== 'object' || Array.isArray(t.tokens)) {
    throw new Error(`[storefrontDesignLibrary] VisualTheme "${t.id}" tokens object is required`);
  }
  if (t.supportedBlueprints != null) {
    if (!Array.isArray(t.supportedBlueprints) || !t.supportedBlueprints.every((id) => typeof id === 'string')) {
      throw new Error(`[storefrontDesignLibrary] VisualTheme "${t.id}" supportedBlueprints must be string[]`);
    }
  }
  const tokens = /** @type {Record<string, unknown>} */ (t.tokens);
  return Object.freeze({
    id: t.id.trim(),
    version: t.version,
    name: String(t.name).trim(),
    description: typeof t.description === 'string' ? t.description : undefined,
    tokens: Object.freeze({
      palette: tokens.palette && typeof tokens.palette === 'object' ? Object.freeze({ .../** @type {object} */ (tokens.palette) }) : undefined,
      typography:
        tokens.typography && typeof tokens.typography === 'object'
          ? Object.freeze({ .../** @type {object} */ (tokens.typography) })
          : undefined,
      spacing:
        tokens.spacing && typeof tokens.spacing === 'object'
          ? Object.freeze({ .../** @type {object} */ (tokens.spacing) })
          : undefined,
      radius:
        tokens.radius && typeof tokens.radius === 'object'
          ? Object.freeze({ .../** @type {object} */ (tokens.radius) })
          : undefined,
      shadow:
        tokens.shadow && typeof tokens.shadow === 'object'
          ? Object.freeze({ .../** @type {object} */ (tokens.shadow) })
          : undefined,
      motion:
        tokens.motion && typeof tokens.motion === 'object'
          ? Object.freeze({ .../** @type {object} */ (tokens.motion) })
          : undefined,
    }),
    componentVariants:
      t.componentVariants && typeof t.componentVariants === 'object' && !Array.isArray(t.componentVariants)
        ? Object.freeze({ .../** @type {Record<string, string>} */ (t.componentVariants) })
        : undefined,
    supportedBlueprints: Array.isArray(t.supportedBlueprints)
      ? Object.freeze([...t.supportedBlueprints])
      : undefined,
    metadata:
      t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
        ? Object.freeze({ .../** @type {object} */ (t.metadata) })
        : undefined,
  });
}

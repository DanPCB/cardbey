/**
 * Map legacy website.theme.templateId enum → canonical visualThemeId.
 *
 * Naming protection:
 * - legacyThemeTemplateId = persisted website.theme.templateId (minimal|bold|editorial|warm|dark)
 * - visualThemeId = design-library VisualTheme.id
 *
 * Does not rename or remove persisted values.
 */

/** @type {Readonly<Record<string, string>>} */
export const LEGACY_THEME_TEMPLATE_ID_TO_VISUAL_THEME_ID = Object.freeze({
  minimal: 'minimal-white',
  warm: 'warm-natural',
  bold: 'premium-blue',
  editorial: 'minimal-white',
  dark: 'bold-dark',
  'dark-luxury': 'bold-dark',
});

/**
 * @param {unknown} legacyThemeTemplateId
 * @returns {string | null} visualThemeId
 */
export function mapLegacyThemeTemplateIdToVisualThemeId(legacyThemeTemplateId) {
  const key = String(legacyThemeTemplateId ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  return LEGACY_THEME_TEMPLATE_ID_TO_VISUAL_THEME_ID[key] ?? null;
}

/**
 * Reverse hint for diagnostics (first legacy id that maps to theme).
 * @param {string} visualThemeId
 * @returns {string | null} legacyThemeTemplateId
 */
export function mapVisualThemeIdToPreferredLegacyThemeTemplateId(visualThemeId) {
  const id = String(visualThemeId ?? '').trim();
  for (const [legacy, visual] of Object.entries(LEGACY_THEME_TEMPLATE_ID_TO_VISUAL_THEME_ID)) {
    if (visual === id) return legacy;
  }
  return null;
}

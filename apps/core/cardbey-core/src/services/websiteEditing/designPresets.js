/**
 * Canonical Design adapter presets (C2).
 * Aligns with Dashboard TemplateId and Core LegacyThemeId.
 */

/** @typedef {'minimal'|'bold'|'editorial'|'warm'|'dark'} CanonicalDesignPresetId */

/** @type {readonly CanonicalDesignPresetId[]} */
export const CANONICAL_DESIGN_PRESET_IDS = Object.freeze([
  'minimal',
  'bold',
  'editorial',
  'warm',
  'dark',
]);

/** Legacy UI labels → canonical preset id */
export const LEGACY_STYLE_LABEL_TO_PRESET = Object.freeze({
  minimal: 'minimal',
  bold: 'bold',
  editorial: 'editorial',
  warm: 'warm',
  dark: 'dark',
  'dark luxury': 'dark',
  dark_luxury: 'dark',
  darkluxury: 'dark',
});

/**
 * @param {string|null|undefined} raw
 * @returns {{ ok: true, presetId: CanonicalDesignPresetId } | { ok: false, error: string, code: string }}
 */
export function resolveCanonicalDesignPreset(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!key) {
    return { ok: false, error: 'preset_required', code: 'preset_required' };
  }
  if (CANONICAL_DESIGN_PRESET_IDS.includes(/** @type {CanonicalDesignPresetId} */ (key))) {
    return { ok: true, presetId: /** @type {CanonicalDesignPresetId} */ (key) };
  }
  const mapped = LEGACY_STYLE_LABEL_TO_PRESET[key];
  if (mapped) {
    return { ok: true, presetId: mapped };
  }
  return {
    ok: false,
    error: `Unsupported style preset: ${raw}`,
    code: 'unsupported_preset',
  };
}

export function isCanonicalDesignPreset(id) {
  return CANONICAL_DESIGN_PRESET_IDS.includes(id);
}

import { assertVisualTheme } from '../contracts/visualTheme.js';
import { hasBlueprint } from './blueprintRegistry.js';

/** @type {Map<string, import('../contracts/visualTheme.js').VisualTheme>} */
const store = new Map();
let sealed = false;

function assertOpen() {
  if (sealed) {
    throw new Error('[storefrontDesignLibrary] VisualTheme registry is sealed; runtime mutation is not allowed');
  }
}

/**
 * @param {unknown} definition
 * @param {{ requireKnownBlueprints?: boolean }} [opts]
 */
export function registerVisualTheme(definition, opts = {}) {
  assertOpen();
  const theme = assertVisualTheme(definition);
  if (store.has(theme.id)) {
    throw new Error(`[storefrontDesignLibrary] Duplicate visualTheme id "${theme.id}"`);
  }
  if (opts.requireKnownBlueprints !== false && theme.supportedBlueprints) {
    for (const blueprintId of theme.supportedBlueprints) {
      if (!hasBlueprint(blueprintId)) {
        throw new Error(
          `[storefrontDesignLibrary] VisualTheme "${theme.id}" references unknown blueprint "${blueprintId}"`,
        );
      }
    }
  }
  store.set(theme.id, theme);
  return theme;
}

/** @param {string} id */
export function getVisualTheme(id) {
  const key = String(id ?? '').trim();
  return store.get(key) ?? null;
}

export function listVisualThemes() {
  return Object.freeze([...store.values()]);
}

/** @param {string} id */
export function hasVisualTheme(id) {
  return store.has(String(id ?? '').trim());
}

/**
 * @param {string} themeId
 * @param {string} blueprintId
 */
export function isThemeCompatibleWithBlueprint(themeId, blueprintId) {
  const theme = getVisualTheme(themeId);
  if (!theme) return false;
  if (!theme.supportedBlueprints || theme.supportedBlueprints.length === 0) return true;
  return theme.supportedBlueprints.includes(String(blueprintId ?? '').trim());
}

export function sealVisualThemeRegistry() {
  sealed = true;
}

/** @internal test helper */
export function __resetVisualThemeRegistryForTests() {
  store.clear();
  sealed = false;
}

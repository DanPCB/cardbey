import { assertStorefrontPreviewSample } from '../contracts/previewSample.js';
import { hasBlueprint } from './blueprintRegistry.js';
import { hasVisualTheme, isThemeCompatibleWithBlueprint } from './visualThemeRegistry.js';

/** @type {Map<string, import('../contracts/previewSample.js').StorefrontPreviewSample>} */
const store = new Map();
let sealed = false;

function assertOpen() {
  if (sealed) {
    throw new Error('[storefrontDesignLibrary] PreviewSample registry is sealed; runtime mutation is not allowed');
  }
}

/**
 * @param {unknown} definition
 * @param {{ requireThemeBlueprintCompatibility?: boolean }} [opts]
 */
export function registerPreviewSample(definition, opts = {}) {
  assertOpen();
  const sample = assertStorefrontPreviewSample(definition);
  if (store.has(sample.id)) {
    throw new Error(`[storefrontDesignLibrary] Duplicate previewSample id "${sample.id}"`);
  }
  if (!hasBlueprint(sample.blueprintId)) {
    throw new Error(
      `[storefrontDesignLibrary] PreviewSample "${sample.id}" references unknown blueprint "${sample.blueprintId}"`,
    );
  }
  if (!hasVisualTheme(sample.themeId)) {
    throw new Error(
      `[storefrontDesignLibrary] PreviewSample "${sample.id}" references unknown theme "${sample.themeId}"`,
    );
  }
  if (opts.requireThemeBlueprintCompatibility !== false) {
    if (!isThemeCompatibleWithBlueprint(sample.themeId, sample.blueprintId)) {
      throw new Error(
        `[storefrontDesignLibrary] PreviewSample "${sample.id}" theme "${sample.themeId}" does not support blueprint "${sample.blueprintId}"`,
      );
    }
  }
  store.set(sample.id, sample);
  return sample;
}

/** @param {string} id */
export function getPreviewSample(id) {
  const key = String(id ?? '').trim();
  return store.get(key) ?? null;
}

export function listPreviewSamples() {
  return Object.freeze([...store.values()]);
}

/** @param {string} id */
export function hasPreviewSample(id) {
  return store.has(String(id ?? '').trim());
}

export function sealPreviewSampleRegistry() {
  sealed = true;
}

/** @internal test helper */
export function __resetPreviewSampleRegistryForTests() {
  store.clear();
  sealed = false;
}

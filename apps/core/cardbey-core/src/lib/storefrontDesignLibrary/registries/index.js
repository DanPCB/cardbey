/**
 * Boot-time registration of canonical design-library definitions.
 * Sealed after init — request handlers must not mutate registries.
 */

import { BLUEPRINT_DEFINITIONS } from '../definitions/blueprints/index.js';
import { VISUAL_THEME_DEFINITIONS } from '../definitions/themes/index.js';
import { PREVIEW_SAMPLE_DEFINITIONS } from '../definitions/previewSamples/index.js';
import {
  registerBlueprint,
  getBlueprint,
  listBlueprints,
  hasBlueprint,
  sealBlueprintRegistry,
  __resetBlueprintRegistryForTests,
} from './blueprintRegistry.js';
import {
  registerVisualTheme,
  getVisualTheme,
  listVisualThemes,
  hasVisualTheme,
  isThemeCompatibleWithBlueprint,
  sealVisualThemeRegistry,
  __resetVisualThemeRegistryForTests,
} from './visualThemeRegistry.js';
import {
  registerPreviewSample,
  getPreviewSample,
  listPreviewSamples,
  hasPreviewSample,
  sealPreviewSampleRegistry,
  __resetPreviewSampleRegistryForTests,
} from './previewSampleRegistry.js';

let initialized = false;

export function initializeDesignLibraryRegistries() {
  if (initialized) return;
  for (const bp of BLUEPRINT_DEFINITIONS) registerBlueprint(bp);
  for (const theme of VISUAL_THEME_DEFINITIONS) registerVisualTheme(theme);
  for (const sample of PREVIEW_SAMPLE_DEFINITIONS) registerPreviewSample(sample);
  sealBlueprintRegistry();
  sealVisualThemeRegistry();
  sealPreviewSampleRegistry();
  initialized = true;
}

/** Eager boot for production import path. */
initializeDesignLibraryRegistries();

export {
  registerBlueprint,
  getBlueprint,
  listBlueprints,
  hasBlueprint,
  registerVisualTheme,
  getVisualTheme,
  listVisualThemes,
  hasVisualTheme,
  isThemeCompatibleWithBlueprint,
  registerPreviewSample,
  getPreviewSample,
  listPreviewSamples,
  hasPreviewSample,
};

/** @internal — for isolated unit tests that re-register */
export function __reinitializeDesignLibraryRegistriesForTests() {
  __resetBlueprintRegistryForTests();
  __resetVisualThemeRegistryForTests();
  __resetPreviewSampleRegistryForTests();
  initialized = false;
  initializeDesignLibraryRegistries();
}

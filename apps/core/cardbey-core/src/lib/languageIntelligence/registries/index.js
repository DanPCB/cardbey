/**
 * Boot-time registration of Language Intelligence definitions.
 * Sealed after init — request handlers must not mutate registries.
 */

import { LANGUAGE_DEFINITIONS } from '../definitions/languages.js';
import { REGION_DEFINITIONS } from '../definitions/regions.js';
import { PLATFORM_GLOSSARY_DEFINITIONS } from '../definitions/platformGlossary.js';
import {
  registerLanguage,
  getLanguage,
  listLanguages,
  hasLanguage,
  sealLanguageRegistry,
  __resetLanguageRegistryForTests,
} from './languageRegistry.js';
import {
  registerRegion,
  getRegion,
  listRegions,
  hasRegion,
  sealRegionRegistry,
  __resetRegionRegistryForTests,
} from './regionRegistry.js';
import {
  registerGlossaryEntry,
  getGlossaryEntry,
  listGlossaryEntries,
  matchGlossaryInText,
  sealGlossaryRegistry,
  __resetGlossaryRegistryForTests,
} from './glossaryRegistry.js';

let initialized = false;

export function initializeLanguageIntelligenceRegistries() {
  if (initialized) return;
  for (const lang of LANGUAGE_DEFINITIONS) registerLanguage(lang);
  for (const region of REGION_DEFINITIONS) registerRegion(region);
  for (const entry of PLATFORM_GLOSSARY_DEFINITIONS) registerGlossaryEntry(entry);
  sealLanguageRegistry();
  sealRegionRegistry();
  sealGlossaryRegistry();
  initialized = true;
}

initializeLanguageIntelligenceRegistries();

export {
  registerLanguage,
  getLanguage,
  listLanguages,
  hasLanguage,
  registerRegion,
  getRegion,
  listRegions,
  hasRegion,
  registerGlossaryEntry,
  getGlossaryEntry,
  listGlossaryEntries,
  matchGlossaryInText,
};

/** @internal — for isolated unit tests that re-register */
export function __reinitializeLanguageIntelligenceRegistriesForTests() {
  __resetLanguageRegistryForTests();
  __resetRegionRegistryForTests();
  __resetGlossaryRegistryForTests();
  initialized = false;
  initializeLanguageIntelligenceRegistries();
}

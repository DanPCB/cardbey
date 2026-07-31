/**
 * StorefrontBlueprint contract — structural intent only.
 *
 * Naming (Phase 0 collision protection):
 * - Use blueprintId (never ambiguous "templateId")
 * - Does not own business facts, demo content, or visual tokens
 */

import { isSectionRole } from './sectionRole.js';
import { isStorefrontAction } from './storefrontAction.js';
import { isBusinessModel } from './businessModel.js';
import { isBusinessContentRole } from './contentRole.js';

export const FALLBACK_BEHAVIORS = Object.freeze([
  'hide',
  'collapse',
  'request_input',
  'allow_suggested',
]);

/**
 * @typedef {Object} BlueprintSectionDefinition
 * @property {string} role
 * @property {string} defaultVariant
 * @property {string[]} supportedVariants
 * @property {string[]} requiredData
 * @property {'hide'|'collapse'|'request_input'|'allow_suggested'} fallbackBehavior
 * @property {number} defaultPriority
 */

/**
 * @typedef {Object} StorefrontBlueprint
 * @property {string} id
 * @property {number} version
 * @property {string} name
 * @property {string} [description]
 * @property {string[]} preferredBusinessModels
 * @property {string[]} supportedContentRoles
 * @property {string[]} supportedActions
 * @property {string[]} requiredData
 * @property {string[]} optionalData
 * @property {BlueprintSectionDefinition[]} defaultSections
 * @property {{ businessModel?: number, contentCoverage?: number, actionFit?: number, mediaAvailability?: number }} [compatibilityWeights]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @param {unknown} section
 * @param {string} blueprintId
 * @returns {BlueprintSectionDefinition}
 */
export function assertBlueprintSection(section, blueprintId = '?') {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`[storefrontDesignLibrary] Invalid section on blueprint "${blueprintId}"`);
  }
  const s = /** @type {Record<string, unknown>} */ (section);
  if (!isSectionRole(s.role)) {
    throw new Error(
      `[storefrontDesignLibrary] Invalid section role "${String(s.role)}" on blueprint "${blueprintId}"`,
    );
  }
  if (typeof s.defaultVariant !== 'string' || !s.defaultVariant.trim()) {
    throw new Error(`[storefrontDesignLibrary] Missing defaultVariant on blueprint "${blueprintId}" section "${s.role}"`);
  }
  if (!Array.isArray(s.supportedVariants) || s.supportedVariants.length === 0) {
    throw new Error(`[storefrontDesignLibrary] supportedVariants required on blueprint "${blueprintId}" section "${s.role}"`);
  }
  if (!Array.isArray(s.requiredData)) {
    throw new Error(`[storefrontDesignLibrary] requiredData must be an array on blueprint "${blueprintId}" section "${s.role}"`);
  }
  if (!FALLBACK_BEHAVIORS.includes(/** @type {string} */ (s.fallbackBehavior))) {
    throw new Error(
      `[storefrontDesignLibrary] Invalid fallbackBehavior "${String(s.fallbackBehavior)}" on blueprint "${blueprintId}"`,
    );
  }
  if (typeof s.defaultPriority !== 'number' || !Number.isFinite(s.defaultPriority)) {
    throw new Error(`[storefrontDesignLibrary] defaultPriority must be a number on blueprint "${blueprintId}"`);
  }
  return /** @type {BlueprintSectionDefinition} */ (s);
}

/**
 * @param {unknown} raw
 * @returns {StorefrontBlueprint}
 */
export function assertStorefrontBlueprint(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[storefrontDesignLibrary] Blueprint must be an object');
  }
  const b = /** @type {Record<string, unknown>} */ (raw);
  if (typeof b.id !== 'string' || !b.id.trim()) {
    throw new Error('[storefrontDesignLibrary] Blueprint id is required');
  }
  if (typeof b.version !== 'number' || !Number.isInteger(b.version) || b.version < 1) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" version must be an integer >= 1`);
  }
  if (typeof b.name !== 'string' || !b.name.trim()) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" name is required`);
  }
  if (!Array.isArray(b.preferredBusinessModels) || !b.preferredBusinessModels.every(isBusinessModel)) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" has invalid preferredBusinessModels`);
  }
  if (!Array.isArray(b.supportedContentRoles) || !b.supportedContentRoles.every(isBusinessContentRole)) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" has invalid supportedContentRoles`);
  }
  if (!Array.isArray(b.supportedActions) || b.supportedActions.length === 0) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" supportedActions required`);
  }
  for (const action of b.supportedActions) {
    if (!isStorefrontAction(action)) {
      throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" invalid action "${String(action)}"`);
    }
  }
  if (!Array.isArray(b.requiredData) || !Array.isArray(b.optionalData)) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" requiredData/optionalData must be arrays`);
  }
  if (!Array.isArray(b.defaultSections) || b.defaultSections.length === 0) {
    throw new Error(`[storefrontDesignLibrary] Blueprint "${b.id}" defaultSections required`);
  }
  const sections = b.defaultSections.map((s) => assertBlueprintSection(s, b.id));
  return Object.freeze({
    id: b.id.trim(),
    version: b.version,
    name: String(b.name).trim(),
    description: typeof b.description === 'string' ? b.description : undefined,
    preferredBusinessModels: Object.freeze([...b.preferredBusinessModels]),
    supportedContentRoles: Object.freeze([...b.supportedContentRoles]),
    supportedActions: Object.freeze([...b.supportedActions]),
    requiredData: Object.freeze([...b.requiredData]),
    optionalData: Object.freeze([...b.optionalData]),
    defaultSections: Object.freeze(sections.map((s) => Object.freeze({ ...s, supportedVariants: Object.freeze([...s.supportedVariants]), requiredData: Object.freeze([...s.requiredData]) }))),
    compatibilityWeights:
      b.compatibilityWeights && typeof b.compatibilityWeights === 'object'
        ? Object.freeze({ .../** @type {object} */ (b.compatibilityWeights) })
        : undefined,
    metadata:
      b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata)
        ? Object.freeze({ .../** @type {object} */ (b.metadata) })
        : undefined,
  });
}

/**
 * @param {string} role
 * @param {Partial<BlueprintSectionDefinition>} [overrides]
 * @returns {BlueprintSectionDefinition}
 */
export function section(role, overrides = {}) {
  const defaultVariant = overrides.defaultVariant ?? 'default';
  return {
    role,
    defaultVariant,
    supportedVariants: overrides.supportedVariants ?? [defaultVariant],
    requiredData: overrides.requiredData ?? [],
    fallbackBehavior: overrides.fallbackBehavior ?? 'hide',
    defaultPriority: overrides.defaultPriority ?? 100,
  };
}

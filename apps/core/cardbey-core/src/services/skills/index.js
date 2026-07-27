/**
 * Composable skills — public exports.
 */

import composableSkillRegistry from './skillRegistry.js';
import compositionEngine from './compositionEngine.js';
import { ensureRuntimeAuthorizedContext } from '../../lib/runtime/performerRuntime/runtimeOwnership.js';

export { SkillRegistry } from './skillRegistry.js';
export { CompositionEngine } from './compositionEngine.js';
export { SkillTestHarness } from './skillTestHarness.js';
export { default as composableSkillRegistry } from './skillRegistry.js';
export { default as compositionEngine } from './compositionEngine.js';
export { default as skillTestHarness } from './skillTestHarness.js';

/**
 * Resolve composable skill for a runtime intent/capability.
 * @param {string} intentType
 */
export function resolveComposableSkill(intentType) {
  const label = String(intentType ?? '').trim();
  if (!label) return null;

  const byId = composableSkillRegistry.get(label);
  if (byId) return byId;

  const matches = composableSkillRegistry.findByCapability(label);
  if (!matches.length) return null;

  return matches.sort((a, b) =>
    composableSkillRegistry.compareVersions(b.version, a.version),
  )[0];
}

/**
 * Execute composable skill for runtime kernel handoff.
 * @param {string} skillId
 * @param {object} context
 * @param {{ version?: string; composition?: 'sequence'|'parallel'; skills?: object[]; timeout?: number; fallback?: string }} [options]
 */
export async function executeComposableSkill(skillId, context = {}, options = {}) {
  const authorizedContext = ensureRuntimeAuthorizedContext(context, null, 'composable_skill');

  if (options.composition === 'sequence' && Array.isArray(options.skills) && options.skills.length) {
    return compositionEngine.sequence(options.skills, authorizedContext);
  }
  if (options.composition === 'parallel' && Array.isArray(options.skills) && options.skills.length) {
    return compositionEngine.parallel(options.skills, authorizedContext);
  }

  return compositionEngine.executeSkill(
    {
      id: skillId,
      version: options.version,
      timeout: options.timeout,
      fallback: options.fallback,
    },
    authorizedContext,
  );
}

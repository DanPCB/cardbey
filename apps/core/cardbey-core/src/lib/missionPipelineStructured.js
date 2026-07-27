/**
 * Structured mission steps — materialized from declarative JSON blueprints (Phase 5).
 * Execution stays in runNextMissionPipelineStep + runMissionUntilBlocked (single runner).
 */

export {
  checkpointOptionValuesFromItems as checkpointOptionValues,
  resolveCheckpointOptionsForLocale,
  materializeBlueprintSteps,
  loadBlueprint,
  loadBlueprintDocument,
  listBlueprintMissionTypes,
  validateBlueprint,
  invalidateBlueprintCache,
  BLUEPRINT_REGISTRY,
} from './execution/blueprintLoader.js';

import { materializeBlueprintSteps } from './execution/blueprintLoader.js';

/**
 * @param {string} missionType
 * @param {string} [locale]
 * @returns {Array<{
 *   orderIndex: number,
 *   toolName: string,
 *   label: string,
 *   stepKind: 'action' | 'checkpoint' | 'conditional',
 *   configJson?: object,
 *   inputJson?: object,
 * }>}
 */
export function getStructuredMissionSteps(missionType, locale = 'en') {
  return materializeBlueprintSteps(missionType, locale);
}

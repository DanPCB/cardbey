/**
 * Mission Pipeline v1: minimal default step planning (no full agent planning).
 * buildDefaultMissionSteps(type, metadata) returns step configs for known types.
 * Uses intent pipeline registry when available; otherwise falls back to legacy switch.
 * All toolNames are validated against the Tool Registry; unregistered tools are omitted.
 */

import { getToolDefinition } from './toolRegistry.js';
import { getPipelineForIntent } from './missionPlan/intentPipelineRegistry.js';

/**
 * @param {string} type
 * @param {object} [metadata]
 * @returns {{ toolName: string, label: string, orderIndex: number }[]}
 */
export function buildDefaultMissionSteps(type, metadata = {}) {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  const pipeline = getPipelineForIntent(t);
  const stepToolNames = pipeline.stepToolNames;
  if (Array.isArray(stepToolNames) && stepToolNames.length > 0) {
    const checkpoints = Array.isArray(pipeline.checkpoints) ? pipeline.checkpoints : [];
    const raw = stepToolNames.map((toolName, i) => ({
      toolName,
      label: checkpoints[i] ?? toolName,
      orderIndex: i,
    }));
    return raw.filter((step) => {
      const def = getToolDefinition(step.toolName);
      if (!def) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[MissionSteps] tool not in registry, skipping: ${step.toolName}`);
        }
        return false;
      }
      return true;
    });
  }

  let raw = [];
  switch (t) {
    case 'store_improvement':
      raw = [
        { toolName: 'analyze_store', label: 'Analyze store', orderIndex: 0 },
        { toolName: 'generate_tags', label: 'Generate tags', orderIndex: 1 },
        { toolName: 'rewrite_descriptions', label: 'Rewrite descriptions', orderIndex: 2 },
        { toolName: 'improve_hero', label: 'Improve hero', orderIndex: 3 },
      ];
      break;
    case 'store_publish_preparation':
      raw = [
        { toolName: 'analyze_store', label: 'Analyze store', orderIndex: 0 },
        { toolName: 'generate_tags', label: 'Generate tags', orderIndex: 1 },
        { toolName: 'rewrite_descriptions', label: 'Rewrite descriptions', orderIndex: 2 },
      ];
      break;
    case 'generate_tags':
      raw = [{ toolName: 'generate_tags', label: 'Generate tags', orderIndex: 0 }];
      break;
    case 'rewrite_descriptions':
      raw = [{ toolName: 'rewrite_descriptions', label: 'Rewrite descriptions', orderIndex: 0 }];
      break;
    case 'improve_hero':
      raw = [{ toolName: 'improve_hero', label: 'Improve hero', orderIndex: 0 }];
      break;
    case 'promotion_launch':
      raw = [
        { toolName: 'create_promotion', label: 'Create promotion', orderIndex: 0 },
        { toolName: 'generate_promotion_asset', label: 'Generate promotion asset', orderIndex: 1 },
        { toolName: 'assign_promotion_slot', label: 'Assign promotion slot', orderIndex: 2 },
        { toolName: 'activate_promotion', label: 'Activate promotion', orderIndex: 3 },
      ];
      break;
    case 'promotion_slot_assignment':
      raw = [
        { toolName: 'assign_promotion_slot', label: 'Assign promotion slot', orderIndex: 0 },
        { toolName: 'activate_promotion', label: 'Activate promotion', orderIndex: 1 },
      ];
      break;
    case 'screen_content_deployment':
      raw = [
        { toolName: 'resolve_target_screens', label: 'Resolve target screens', orderIndex: 0 },
        { toolName: 'prepare_screen_asset', label: 'Prepare screen asset', orderIndex: 1 },
        { toolName: 'assign_screen_slot', label: 'Assign screen slot', orderIndex: 2 },
        { toolName: 'activate_screen_content', label: 'Activate screen content', orderIndex: 3 },
      ];
      break;
    default:
      return [];
  }
  const filtered = raw.filter((step) => {
    const def = getToolDefinition(step.toolName);
    if (!def) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[MissionSteps] tool not in registry, skipping: ${step.toolName}`);
      }
      return false;
    }
    return true;
  });
  return filtered;
}

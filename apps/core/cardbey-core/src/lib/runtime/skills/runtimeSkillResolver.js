/**
 * Runtime Skill Resolver — maps graph nodes to operational skills (Phase D).
 */

import {
  getRuntimeSkill,
  resolveSkillIdForAgent,
  resolveSkillIdForTool,
  SKILL_TYPE,
} from './runtimeSkillRegistry.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Resolve skill for a mission graph node.
 * Priority: metadata.skillId → assignedAgent → assignedTool → orchestration fallback.
 *
 * @param {object} node
 * @returns {{ skill: object; skillId: string; resolvedVia: string } | { skill: null; error: string }}
 */
export function resolveSkillForGraphNode(node) {
  if (!node || typeof node !== 'object') {
    return { skill: null, error: 'INVALID_NODE' };
  }

  const explicitSkillId = str(node.metadata?.skillId);
  if (explicitSkillId) {
    const skill = getRuntimeSkill(explicitSkillId);
    if (skill) return { skill, skillId: skill.skillId, resolvedVia: 'metadata.skillId' };
  }

  const agent = str(node.assignedAgent);
  if (agent) {
    const skillId = resolveSkillIdForAgent(agent);
    if (skillId) {
      const skill = getRuntimeSkill(skillId);
      if (skill) return { skill, skillId: skill.skillId, resolvedVia: 'assignedAgent' };
    }
  }

  const tool = str(node.assignedTool).toLowerCase();
  if (tool) {
    const skillId = resolveSkillIdForTool(tool);
    const skill = getRuntimeSkill(skillId);
    if (skill) {
      const supportsTool =
        skill.supportedTools.length === 0 || skill.supportedTools.includes(tool);
      if (supportsTool) {
        return { skill, skillId: skill.skillId, resolvedVia: 'assignedTool' };
      }
      return { skill: null, error: 'TOOL_NOT_SUPPORTED_BY_SKILL', skillId, tool };
    }
  }

  const fallback = getRuntimeSkill(SKILL_TYPE.ORCHESTRATION);
  if (fallback && tool) {
    return { skill: fallback, skillId: fallback.skillId, resolvedVia: 'orchestration_fallback' };
  }

  return { skill: null, error: 'NO_SKILL_RESOLVABLE' };
}

/**
 * Validate skill supports the node's assigned tool.
 * @param {object} skill
 * @param {object} node
 */
export function assertSkillSupportsNodeTool(skill, node) {
  const tool = str(node?.assignedTool).toLowerCase();
  if (!tool) return { ok: true };
  if (!skill?.supportedTools?.length) return { ok: true };
  if (skill.supportedTools.includes(tool)) return { ok: true };
  return { ok: false, code: 'TOOL_NOT_IN_SKILL', tool, skillId: skill.skillId };
}

export default {
  resolveSkillForGraphNode,
  assertSkillSupportsNodeTool,
};

/**
 * Validates compiled topology artifacts before HITL or persistence.
 */

import { isRegisteredTool } from '../intake/intakeToolRegistry.js';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {import('./types.ts').TopologyArtifact | Record<string, unknown>} topology
 * @returns {{ ok: boolean, errors?: string[], warnings?: string[] }}
 */
export function validateTopologyArtifact(topology) {
  const errors = [];
  const warnings = [];

  if (!isObject(topology)) {
    return { ok: false, errors: ['topology must be an object'] };
  }

  for (const field of ['id', 'version', 'missionType']) {
    if (typeof topology[field] !== 'string' || !String(topology[field]).trim()) {
      errors.push(`topology.${field} is required`);
    }
  }

  if (!Array.isArray(topology.nodes) || topology.nodes.length === 0) {
    errors.push('topology.nodes must be a non-empty array');
    return { ok: false, errors, warnings: warnings.length ? warnings : undefined };
  }

  const nodeIds = new Set();
  const nodeIdList = [];

  for (let i = 0; i < topology.nodes.length; i++) {
    const node = topology.nodes[i];
    if (!isObject(node)) {
      errors.push(`topology.nodes[${i}] must be an object`);
      continue;
    }

    const id = typeof node.id === 'string' ? node.id.trim() : '';
    if (!id) {
      errors.push(`topology.nodes[${i}].id is required`);
      continue;
    }
    if (nodeIds.has(id)) {
      errors.push(`duplicate node id: ${id}`);
    }
    nodeIds.add(id);
    nodeIdList.push(id);

    const toolName = typeof node.toolName === 'string' ? node.toolName.trim() : '';
    if (!toolName) {
      errors.push(`topology.nodes[${i}].toolName is required`);
    } else if (!isRegisteredTool(toolName)) {
      errors.push(`topology.nodes[${i}].toolName "${toolName}" is not in intake tool registry`);
    }

    if (typeof node.orderIndex !== 'number' || !Number.isFinite(node.orderIndex)) {
      errors.push(`topology.nodes[${i}].orderIndex must be a finite number`);
    }

    if (Array.isArray(node.dependsOn)) {
      for (const dep of node.dependsOn) {
        if (typeof dep !== 'string' || !dep.trim()) {
          errors.push(`topology.nodes[${i}].dependsOn contains invalid entry`);
        }
      }
    }
  }

  const edges = Array.isArray(topology.edges) ? topology.edges : [];
  const adjacency = new Map();

  for (const node of topology.nodes) {
    if (!isObject(node) || typeof node.id !== 'string') continue;
    const deps = [];
    if (Array.isArray(node.dependsOn)) {
      for (const dep of node.dependsOn) {
        if (typeof dep === 'string' && dep.trim()) deps.push(dep.trim());
      }
    }
    adjacency.set(node.id, deps);
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!isObject(edge)) {
      errors.push(`topology.edges[${i}] must be an object`);
      continue;
    }
    const from = typeof edge.from === 'string' ? edge.from.trim() : '';
    const to = typeof edge.to === 'string' ? edge.to.trim() : '';
    if (!from || !to) {
      errors.push(`topology.edges[${i}] requires from and to`);
      continue;
    }
    if (!nodeIds.has(from)) {
      errors.push(`topology.edges[${i}].from "${from}" references unknown node`);
    }
    if (!nodeIds.has(to)) {
      errors.push(`topology.edges[${i}].to "${to}" references unknown node`);
    }
    const list = adjacency.get(to) ?? [];
    list.push(from);
    adjacency.set(to, list);
  }

  for (const node of topology.nodes) {
    if (!isObject(node) || !Array.isArray(node.dependsOn)) continue;
    for (const dep of node.dependsOn) {
      const depId = typeof dep === 'string' ? dep.trim() : '';
      if (depId && !nodeIds.has(depId)) {
        errors.push(`node "${node.id}" depends on unknown node "${depId}"`);
      }
    }
  }

  const cycle = detectCycle(nodeIdList, adjacency);
  if (cycle) {
    errors.push(`dependency cycle detected: ${cycle.join(' -> ')}`);
  }

  const orderIndexes = topology.nodes
    .filter((n) => isObject(n) && typeof n.orderIndex === 'number')
    .map((n) => n.orderIndex);
  if (orderIndexes.length > 1 && new Set(orderIndexes).size !== orderIndexes.length) {
    warnings.push('duplicate orderIndex values across nodes');
  }

  return {
    ok: errors.length === 0,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

/**
 * @param {string[]} nodeIds
 * @param {Map<string, string[]>} adjacency
 * @returns {string[] | null}
 */
function detectCycle(nodeIds, adjacency) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  /**
   * @param {string} nodeId
   * @returns {string[] | null}
   */
  function dfs(nodeId) {
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      return start >= 0 ? [...stack.slice(start), nodeId] : [nodeId, nodeId];
    }
    if (visited.has(nodeId)) return null;

    visiting.add(nodeId);
    stack.push(nodeId);

    const deps = adjacency.get(nodeId) ?? [];
    for (const dep of deps) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  }

  for (const nodeId of nodeIds) {
    const cycle = dfs(nodeId);
    if (cycle) return cycle;
  }
  return null;
}

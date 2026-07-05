/**
 * Validates policy artifacts (gates, risks, defaults).
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {import('./types.ts').PolicyArtifact | Record<string, unknown>} policy
 * @returns {{ ok: boolean, errors?: string[] }}
 */
export function validatePolicyArtifact(policy) {
  const errors = [];

  if (!isObject(policy)) {
    return { ok: false, errors: ['policy must be an object'] };
  }

  for (const field of ['id', 'version']) {
    if (typeof policy[field] !== 'string' || !String(policy[field]).trim()) {
      errors.push(`policy.${field} is required`);
    }
  }

  if (!Array.isArray(policy.gates)) {
    errors.push('policy.gates must be an array');
  } else {
    for (let i = 0; i < policy.gates.length; i++) {
      const gate = policy.gates[i];
      if (!isObject(gate)) {
        errors.push(`policy.gates[${i}] must be an object`);
        continue;
      }
      if (typeof gate.type !== 'string' || !gate.type.trim()) {
        errors.push(`policy.gates[${i}].type is required`);
      }
      const hasNode = typeof gate.nodeId === 'string' && gate.nodeId.trim();
      const hasTool = typeof gate.tool === 'string' && gate.tool.trim();
      if (!hasNode && !hasTool) {
        errors.push(`policy.gates[${i}] requires nodeId or tool`);
      }
    }
  }

  if (!Array.isArray(policy.risks)) {
    errors.push('policy.risks must be an array');
  } else {
    for (let i = 0; i < policy.risks.length; i++) {
      if (!isObject(policy.risks[i])) {
        errors.push(`policy.risks[${i}] must be an object`);
      }
    }
  }

  if (policy.defaults != null && !isObject(policy.defaults)) {
    errors.push('policy.defaults must be an object when present');
  }

  return {
    ok: errors.length === 0,
    errors: errors.length ? errors : undefined,
  };
}

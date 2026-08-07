/**
 * Discovery validation result contract — gate before publishable discovery state.
 */

export const DISCOVERY_VALIDATION_STATUSES = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
  BLOCKED: 'blocked',
});

/**
 * @typedef {Object} DiscoveryValidationIssue
 * @property {string} code
 * @property {string} stage
 * @property {string} message
 * @property {'error'|'warning'} severity
 */

/**
 * @typedef {Object} DiscoveryValidationResult
 * @property {string} status
 * @property {boolean} publishable
 * @property {DiscoveryValidationIssue[]} issues
 * @property {Record<string, boolean>} stages
 * @property {string} evaluatedAt
 */

/**
 * @param {object} params
 * @param {DiscoveryValidationIssue[]} [params.issues]
 * @param {Record<string, boolean>} [params.stages]
 * @returns {DiscoveryValidationResult}
 */
export function buildDiscoveryValidationResult({ issues = [], stages = {} } = {}) {
  const list = Array.isArray(issues) ? issues : [];
  const errors = list.filter((i) => i.severity === 'error');
  const publishable = errors.length === 0 && stages.publishable !== false;
  const status = publishable
    ? DISCOVERY_VALIDATION_STATUSES.VALID
    : stages.blocked
      ? DISCOVERY_VALIDATION_STATUSES.BLOCKED
      : DISCOVERY_VALIDATION_STATUSES.INVALID;

  return Object.freeze({
    status,
    publishable,
    issues: Object.freeze(list.map((i) => Object.freeze({ ...i }))),
    stages: Object.freeze({ ...stages }),
    evaluatedAt: new Date().toISOString(),
  });
}

/**
 * @param {string} code
 * @param {string} stage
 * @param {string} message
 * @param {'error'|'warning'} [severity]
 * @returns {DiscoveryValidationIssue}
 */
export function discoveryIssue(code, stage, message, severity = 'error') {
  return Object.freeze({ code, stage, message, severity });
}

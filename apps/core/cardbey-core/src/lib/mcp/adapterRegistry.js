/**
 * MCP server / capability adapter registry (foundation).
 *
 * This is NOT an orchestrator: it does not sequence workflows, decide next steps, or replace
 * Mission Execution. Runtime code (e.g. a tool executor) chooses when to call an adapter.
 *
 * Adapters registered here are invoked only from server-side paths that already hold auth context.
 */

/** @typedef {import('./invocationEnvelope.js').McpInvocationEnvelope} McpInvocationEnvelope */

/**
 * @typedef {object} McpAdapterRegistration
 * @property {string} id
 * @property {string} [description]
 * @property {(args: object, envelope: McpInvocationEnvelope) => Promise<unknown>} invoke
 */

/** @type {Map<string, McpAdapterRegistration>} */
const adapters = new Map();

/**
 * @param {string} id
 * @param {McpAdapterRegistration} registration
 */
export function registerMcpAdapter(id, registration) {
  const key = typeof id === 'string' ? id.trim() : '';
  if (!key) throw new Error('[MCP] registerMcpAdapter: id required');
  if (!registration || typeof registration.invoke !== 'function') {
    throw new Error('[MCP] registerMcpAdapter: registration.invoke required');
  }
  adapters.set(key, { ...registration, id: key });
}

/**
 * @returns {string[]}
 */
export function listMcpAdapterIds() {
  return [...adapters.keys()];
}

/**
 * @param {string} id
 * @returns {McpAdapterRegistration | undefined}
 */
export function getMcpAdapter(id) {
  const key = typeof id === 'string' ? id.trim() : '';
  return key ? adapters.get(key) : undefined;
}

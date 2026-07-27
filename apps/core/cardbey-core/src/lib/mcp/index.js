/**
 * Cardbey MCP — controlled tool/context bridge inside Mission Execution architecture.
 *
 * ARCHITECTURE LOCK (single runway):
 * - MCP strengthens the runtime tool surface; it is not a second execution brain.
 * - Mission Execution (pipeline runner, MI intents, approved dispatch paths) remains authority
 *   for when tools run, approvals, and state transitions.
 * - Do not invoke adapters from dashboard UI as the owner of business execution.
 * - Do not add an MCP-specific agent loop beside existing mission/agent paths.
 *
 * EXISTING SURFACE:
 * - HTTP read-only product resources: `src/routes/mcpRoutes.js` (requireAuth, tenant via user).
 *
 * NEXT STEPS (safe):
 * - Register adapters via `registerMcpAdapter`; call `getMcpAdapter` only from tool executors
 *   or MI handlers after building `buildMcpInvocationEnvelope` from request + mission context.
 */

export { buildMcpInvocationEnvelope, assertMcpMutationEnvelope } from './invocationEnvelope.js';
export { registerMcpAdapter, listMcpAdapterIds, getMcpAdapter } from './adapterRegistry.js';
/** Default adapters load from `createApp.js` via `registerDefaultAdapters.js` (single process entry). */

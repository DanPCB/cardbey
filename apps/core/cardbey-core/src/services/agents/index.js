/**
 * Sub-agent runtime — public exports.
 */

import agentRegistry, { AgentRegistry } from './agentRegistry.js';
import messageBus, { MessageBus } from './messageBus.js';
import agentSharedMemory, { AgentSharedMemory } from './agentSharedMemory.js';
import agentLifecycle, {
  AgentLifecycle,
  initializeAgents,
  startAgentHeartbeatLoop,
  stopAgentHeartbeatLoop,
} from './agentLifecycle.js';
import orchestrator, { SubAgentOrchestrator } from './orchestrator.js';

export {
  AgentRegistry,
  MessageBus,
  AgentSharedMemory,
  AgentLifecycle,
  SubAgentOrchestrator,
  initializeAgents,
  startAgentHeartbeatLoop,
  stopAgentHeartbeatLoop,
};

export {
  agentRegistry,
  messageBus,
  agentSharedMemory,
  agentLifecycle,
  orchestrator,
};

export { default as agentRegistryDefault } from './agentRegistry.js';
export { default as messageBusDefault } from './messageBus.js';
export { default as agentSharedMemoryDefault } from './agentSharedMemory.js';
export { default as agentLifecycleDefault } from './agentLifecycle.js';
export { default as orchestratorDefault } from './orchestrator.js';

/**
 * Execute a single sub-agent by id.
 * @param {string} agentId
 * @param {object} context
 */
export async function executeAgent(agentId, context = {}) {
  return orchestrator.executeAgent({ id: String(agentId) }, context);
}

/**
 * Execute sub-agents in parallel.
 * @param {Array<{ id: string }>} agents
 * @param {object} context
 */
export async function executeAgentsParallel(agents, context = {}) {
  return orchestrator.parallel(agents, context);
}

/**
 * Chain sub-agents with handoff.
 * @param {Array<{ id: string }>} agents
 * @param {object} context
 */
export async function executeAgentsChain(agents, context = {}) {
  return orchestrator.chain(agents, context);
}

/**
 * Delegate to best agent for capability.
 * @param {string} capability
 * @param {object} context
 */
export async function delegateToAgent(capability, context = {}) {
  return orchestrator.delegate(capability, context);
}

/**
 * Resolve agent for runtime intent/capability label.
 * @param {string} capability
 */
export function resolveAgentForCapability(capability) {
  return agentRegistry.findBestAgent(String(capability ?? '').trim());
}

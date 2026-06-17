/**
 * Agent Shared Memory — workspace + unified memory facade for multi-agent runs.
 */

import memoryFacade, { normalizeMemoryContext } from '../memory/memoryFacade.js';

export class AgentSharedMemory {
  constructor() {
    /** @type {Map<string, { patches: Record<string, unknown>; bundle: object|null }>} */
    this.workspaces = new Map();
  }

  /**
   * @param {string|null|undefined} orchestrationId
   */
  workspaceKey(orchestrationId) {
    return orchestrationId ? String(orchestrationId) : 'default';
  }

  /**
   * @param {string|null|undefined} orchestrationId
   */
  getWorkspace(orchestrationId) {
    const key = this.workspaceKey(orchestrationId);
    if (!this.workspaces.has(key)) {
      this.workspaces.set(key, { patches: {}, bundle: null });
    }
    return this.workspaces.get(key);
  }

  /**
   * @param {object} context
   */
  async loadBundle(context = {}) {
    const memoryContext =
      context.memoryContext && typeof context.memoryContext === 'object'
        ? context.memoryContext
        : {
            actor: context.actor ?? { type: 'store_owner', id: context.userId ?? null },
            storeId: context.storeId ?? null,
            sessionId: context.sessionId ?? null,
            missionId: context.missionId ?? null,
            sessionHints: context.sessionHints,
          };

    return memoryFacade.getBundle(normalizeMemoryContext(memoryContext));
  }

  /**
   * @param {object} baseContext
   * @param {string|null|undefined} orchestrationId
   * @param {object|null} [bundle]
   */
  buildAgentContext(baseContext, orchestrationId, bundle = null) {
    const workspace = this.getWorkspace(orchestrationId);
    if (bundle) workspace.bundle = bundle;

    return {
      ...baseContext,
      orchestrationId: this.workspaceKey(orchestrationId),
      sharedMemory: {
        bundle: workspace.bundle,
        agentResults: { ...workspace.patches },
      },
    };
  }

  /**
   * @param {string|null|undefined} orchestrationId
   * @param {string} agentId
   * @param {unknown} result
   */
  recordAgentResult(orchestrationId, agentId, result) {
    const workspace = this.getWorkspace(orchestrationId);
    workspace.patches[String(agentId)] = result;
    return { ...workspace.patches };
  }

  /**
   * @param {string|null|undefined} orchestrationId
   * @param {string} fromAgent
   * @param {string} toAgent
   * @param {unknown} data
   */
  shareBetweenAgents(orchestrationId, fromAgent, toAgent, data) {
    const workspace = this.getWorkspace(orchestrationId);
    const key = `${fromAgent}->${toAgent}`;
    workspace.patches[key] = data;
    return data;
  }

  /**
   * @param {string|null|undefined} orchestrationId
   */
  clearWorkspace(orchestrationId) {
    this.workspaces.delete(this.workspaceKey(orchestrationId));
  }

  resetForTests() {
    this.workspaces.clear();
  }
}

const agentSharedMemory = new AgentSharedMemory();
export default agentSharedMemory;

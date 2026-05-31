/**
 * Multi-agent orchestration coordinator (compatibility restore).
 *
 * Full wave/spawn implementation lives behind optional specialist agents; this module
 * restores boot-time imports for missionPipelineRunner. When specialist agents are not
 * wired, orchestrate() returns an empty result map and logs once (mission still completes).
 */

const STUB_LOGGED = { default: false, campaign: false };

/**
 * @param {{
 *   missionId: string,
 *   blackboard?: { appendEvent?: Function, appendEventBatch?: Function, flushOrchestrationEvents?: Function },
 *   locale?: string,
 *   tenantKey?: string,
 *   orchestrationKind?: string,
 *   baseContext?: object,
 * }} opts
 */
export class AgentCoordinator {
  constructor(opts = {}) {
    this.missionId = String(opts.missionId ?? '').trim();
    this.blackboard = opts.blackboard ?? null;
    this.locale = opts.locale ?? 'en';
    this.tenantKey = opts.tenantKey ?? 'default';
    this.orchestrationKind = opts.orchestrationKind ?? 'default';
    this.baseContext =
      opts.baseContext && typeof opts.baseContext === 'object' && !Array.isArray(opts.baseContext)
        ? opts.baseContext
        : {};
    this.agents = new Map();
    this.maxAgents = 8;
    this.agentTimeoutMs = 30_000;
    this.totalSpawned = 0;
    this.batchingEnabled =
      typeof this.blackboard?.appendEventBatch === 'function' &&
      typeof this.blackboard?.flushOrchestrationEvents === 'function';
    this.activeWaveCount = 0;
  }

  /**
   * Run multi-agent orchestration for a mission goal.
   * @param {string} goal
   * @param {object} [missionContext]
   * @returns {Promise<Record<string, { agentType?: string, result?: object, summary?: string, confidence?: number, taskId?: string }>>}
   */
  async orchestrate(goal, missionContext = {}) {
    void goal;
    void missionContext;

    const kind = this.orchestrationKind === 'campaign_orchestration' ? 'campaign' : 'default';
    if (!STUB_LOGGED[kind]) {
      STUB_LOGGED[kind] = true;
      console.warn(
        `[AgentCoordinator] orchestration stub active (kind=${this.orchestrationKind}); ` +
          'returning empty results — restore specialist agents for full multi-agent waves.',
      );
    }

    try {
      if (this.blackboard && typeof this.blackboard.appendEvent === 'function') {
        await this.blackboard.appendEvent(this.missionId, 'orchestration_stub', {
          kind: this.orchestrationKind,
          message: 'Coordinator stub: no specialist agents loaded',
        });
      }
    } catch (e) {
      console.warn('[AgentCoordinator] blackboard append failed (non-fatal):', e?.message || e);
    }

    return {};
  }
}

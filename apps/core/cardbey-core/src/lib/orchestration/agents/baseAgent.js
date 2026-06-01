/**
 * V1 orchestration agent base — deterministic stubs (PHASE_B).
 * No external LLM; safe for local create_store / mission pipeline boot.
 */

const DEV = process.env.NODE_ENV !== 'production';

export class V1OrchestrationAgent {
  static agentType = 'research';

  static agentName = 'research';

  constructor(opts = {}) {
    this.tenantKey = opts.tenantKey ?? 'default';
    this.locale = opts.locale ?? 'en';
    this.context =
      opts.context && typeof opts.context === 'object' && !Array.isArray(opts.context)
        ? opts.context
        : {};
    this.agentType = this.constructor.agentType ?? 'research';
    this.agentName = this.constructor.agentName ?? this.agentType;
  }

  /**
   * @param {object} task
   * @returns {Promise<{ taskId: string, agentType: string, result: object, summary: string, confidence: number, latencyMs: number }>}
   */
  async execute(task) {
    const started = Date.now();
    const taskId = String(task?.taskId ?? '').trim() || `task_${Date.now()}`;
    const agentType = String(task?.agentType ?? this.agentType).trim() || this.agentType;

    if (DEV) {
      console.log(`[agent-stub] ${this.agentName}`, { taskId, agentType, missionId: this.context.missionId });
    }

    const result = this.buildResult(task);
    return {
      taskId,
      agentType,
      result,
      summary: result.summary ?? `${this.agentName} stub complete (V1)`,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.75,
      latencyMs: Math.max(0, Date.now() - started),
    };
  }

  /** @param {object} task */
  buildResult(task) {
    const goal = String(task?.goal ?? task?.description ?? '').trim();
    return {
      stub: true,
      phase: 'PHASE_B',
      agent: this.agentName,
      missionId: this.context.missionId ?? null,
      storeId: this.context.storeId ?? this.context.targetId ?? null,
      tenantId: this.context.tenantId ?? this.tenantKey,
      goal: goal || null,
      note: 'V1 deterministic stub — structured pipeline owns store build',
    };
  }
}

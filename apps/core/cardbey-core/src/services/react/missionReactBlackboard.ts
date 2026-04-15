import type { MissionReactBlackboardLike } from '../../types/react.types.js';

export type EmitContextUpdateFn = (patch: Record<string, unknown>) => void | Promise<void>;

/**
 * In-memory working state for one ReAct run. Callers may persist `snapshot()` into Mission.context.
 * Optional `emitContextUpdate` pushes each reasoning line through createEmitContextUpdate (MissionEvent + DB).
 */
export class MissionReactBlackboard implements MissionReactBlackboardLike {
  private state: Record<string, unknown>;

  private readonly emitContextUpdate?: EmitContextUpdateFn;

  /** Serialize reasoning_line emits so concurrent read-modify-write in mergeMissionContext does not drop lines. */
  private reasoningEmitChain: Promise<void> = Promise.resolve();

  constructor(initial?: Record<string, unknown>, hooks?: { emitContextUpdate?: EmitContextUpdateFn }) {
    this.state = initial && typeof initial === 'object' ? { ...initial } : {};
    this.emitContextUpdate = hooks?.emitContextUpdate;
  }

  /** Wait for queued reasoning_line persistence (call before merging full blackboard snapshot). */
  flushReasoningEmits(): Promise<void> {
    return this.reasoningEmitChain;
  }

  snapshot(): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(this.state)) as Record<string, unknown>;
    } catch {
      return { ...this.state };
    }
  }

  write(key: string, value: unknown): void {
    this.state[key] = value;
  }

  appendReasoningLog(line: string): void {
    const prev = Array.isArray(this.state.reasoning_log) ? [...(this.state.reasoning_log as string[])] : [];
    prev.push(line);
    this.state.reasoning_log = prev;
    if (this.emitContextUpdate) {
      const ts = Date.now();
      const payload = { reasoning_line: { line, timestamp: ts } };
      this.reasoningEmitChain = this.reasoningEmitChain
        .then(() => Promise.resolve(this.emitContextUpdate!(payload)))
        .then(() => undefined)
        .catch(() => undefined);
    }
  }

  /** @internal */
  getState(): Record<string, unknown> {
    return this.state;
  }
}

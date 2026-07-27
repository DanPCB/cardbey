/**
 * SkillRuntime — a checkpointable, pausable, rollback-capable skill executor.
 *
 * The runtime executes an ordered list of steps under an explicit state
 * machine. It can persist a checkpoint after every step (when a
 * `CheckpointStore` is supplied) so a long-running skill can survive being
 * paused on one HTTP request and resumed on another.
 */

import { createLogger } from '../logger.js';
import type { CheckpointStore } from './checkpoint_store.js';
import type {
  Checkpoint,
  ExecutionTrace,
  SkillContext,
  SkillState,
  Step,
} from './types.js';

const log = createLogger('SkillRuntime');

/**
 * Legal state transitions. Any transition not listed here is rejected by
 * `canTransitionTo` / `_transition`. Terminal states (`completed`,
 * `cancelled`) have no outgoing transitions.
 */
const TRANSITIONS: Record<SkillState, SkillState[]> = {
  idle: ['running', 'cancelled'],
  running: ['paused', 'failed', 'completed', 'cancelled'],
  paused: ['running', 'cancelled'],
  failed: ['running', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** States from which a rollback may be initiated. */
const ROLLBACK_ALLOWED_FROM: SkillState[] = [
  'paused',
  'failed',
  'completed',
  'cancelled',
];

export interface SkillRuntimeOptions {
  /** When provided, a checkpoint is saved after each step and transition. */
  store?: CheckpointStore;
}

export class SkillRuntime {
  private state: SkillState = 'idle';
  private currentStepIndex = 0;
  private readonly completedSteps: string[] = [];
  private readonly stepResults: Map<string, any> = new Map();
  private readonly trace: ExecutionTrace[] = [];
  private readonly store?: CheckpointStore;

  /** Set when a pause is requested while a step is in flight. */
  private pauseRequested = false;

  constructor(
    public readonly id: string,
    public readonly intent: string,
    public readonly steps: Step[],
    public readonly context: SkillContext,
    options: SkillRuntimeOptions = {}
  ) {
    if (!id || typeof id !== 'string') {
      throw new Error('SkillRuntime requires a non-empty string id');
    }
    if (!Array.isArray(steps)) {
      throw new Error('SkillRuntime requires a steps array');
    }
    this.store = options.store;
  }

  // ───────────────────────────── Core execution ────────────────────────────

  /** Begin execution from `idle`. Throws if called from any other state. */
  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(
        `start() is only valid from "idle" (current state: "${this.state}")`
      );
    }
    log.info('start', { skillId: this.id, intent: this.intent, steps: this.steps.length });
    this.transition('running');
    await this.persist();
    await this.runLoop();
  }

  /**
   * Cooperative pause. Only valid from `running`. If a step is currently
   * in flight the loop stops once that step settles (the step is not aborted).
   */
  async pause(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error(
        `pause() is only valid from "running" (current state: "${this.state}")`
      );
    }
    log.info('pause', { skillId: this.id, currentStepIndex: this.currentStepIndex });
    this.pauseRequested = true;
    this.transition('paused');
    await this.persist();
  }

  /** Resume from `paused` or `failed`, continuing at the current step. */
  async resume(): Promise<void> {
    if (this.state !== 'paused' && this.state !== 'failed') {
      throw new Error(
        `resume() is only valid from "paused" or "failed" (current state: "${this.state}")`
      );
    }
    log.info('resume', { skillId: this.id, currentStepIndex: this.currentStepIndex });
    this.pauseRequested = false;
    this.transition('running');
    await this.persist();
    await this.runLoop();
  }

  /** Cancel the run. Valid from any non-terminal state. */
  async cancel(): Promise<void> {
    if (!this.canTransitionTo('cancelled')) {
      throw new Error(
        `cancel() is not valid from "${this.state}"`
      );
    }
    log.warn('cancel', { skillId: this.id, currentStepIndex: this.currentStepIndex });
    this.pauseRequested = false;
    this.transition('cancelled');
    await this.persist();
  }

  /**
   * Roll back all completed steps in reverse order, invoking each step's
   * optional `rollback` hook. Errors in individual hooks are recorded and do
   * not stop the remaining rollbacks; an aggregate error is thrown at the end
   * if any hook failed. On completion the run is marked `cancelled`.
   */
  async rollback(): Promise<void> {
    if (!ROLLBACK_ALLOWED_FROM.includes(this.state)) {
      throw new Error(
        `rollback() is not valid from "${this.state}"`
      );
    }
    log.info('rollback', {
      skillId: this.id,
      completedSteps: this.completedSteps.length,
    });

    const failures: Array<{ stepId: string; error: string }> = [];

    for (let i = this.completedSteps.length - 1; i >= 0; i--) {
      const stepId = this.completedSteps[i];
      const step = this.steps.find((s) => s.id === stepId);
      if (!step || typeof step.rollback !== 'function') {
        continue;
      }
      const startedAt = Date.now();
      try {
        await step.rollback(this.context, this.state);
        this.trace.push({
          type: 'step',
          timestamp: new Date(),
          stepId,
          stepName: step.name,
          status: 'rolled_back',
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('rollback step failed', { skillId: this.id, stepId, error: message });
        failures.push({ stepId, error: message });
        this.trace.push({
          type: 'step',
          timestamp: new Date(),
          stepId,
          stepName: step.name,
          status: 'rollback_failed',
          durationMs: Date.now() - startedAt,
          error: message,
        });
      }
    }

    // Unwind internal bookkeeping regardless of individual hook failures.
    this.completedSteps.length = 0;
    this.stepResults.clear();
    this.currentStepIndex = 0;
    this.forceTransition('cancelled');
    await this.persist();

    if (failures.length > 0) {
      throw new Error(
        `rollback completed with ${failures.length} failed hook(s): ` +
          failures.map((f) => `${f.stepId} (${f.error})`).join('; ')
      );
    }
  }

  // ──────────────────────────── State management ───────────────────────────

  getState(): SkillState {
    return this.state;
  }

  getCurrentStep(): number {
    return this.currentStepIndex;
  }

  /** A deep-enough copy of the current run state, safe to persist. */
  getCheckpoint(): Checkpoint {
    return {
      skillId: this.id,
      intent: this.intent,
      state: this.state,
      completedSteps: [...this.completedSteps],
      currentStepIndex: this.currentStepIndex,
      context: this.context,
      stepResults: new Map(this.stepResults),
      timestamp: new Date(),
    };
  }

  // ─────────────────────────────── Introspection ───────────────────────────

  canTransitionTo(targetState: SkillState): boolean {
    return TRANSITIONS[this.state]?.includes(targetState) ?? false;
  }

  getTrace(): ExecutionTrace[] {
    return [...this.trace];
  }

  /** Result recorded by a completed step, if any. */
  getStepResult(stepId: string): any {
    return this.stepResults.get(stepId);
  }

  // ──────────────────────────────── Internals ──────────────────────────────

  /**
   * Drive steps sequentially while in the `running` state. Stops early when a
   * pause/cancel flips the state, marks `failed` on a thrown step, and marks
   * `completed` when every step has run.
   */
  private async runLoop(): Promise<void> {
    while (this.currentStepIndex < this.steps.length) {
      // A pause/cancel transition (possibly from another async caller) flips
      // the state; honour it before starting the next step.
      if (this.state !== 'running') {
        return;
      }

      const step = this.steps[this.currentStepIndex];
      const startedAt = Date.now();
      this.trace.push({
        type: 'step',
        timestamp: new Date(),
        stepId: step.id,
        stepName: step.name,
        status: 'started',
      });

      try {
        const result = await step.execute(this.context, this.state);
        this.stepResults.set(step.id, result);
        this.completedSteps.push(step.id);
        this.currentStepIndex += 1;
        this.trace.push({
          type: 'step',
          timestamp: new Date(),
          stepId: step.id,
          stepName: step.name,
          status: 'completed',
          durationMs: Date.now() - startedAt,
        });
        await this.persist();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('step failed', { skillId: this.id, stepId: step.id, error: message });
        this.trace.push({
          type: 'step',
          timestamp: new Date(),
          stepId: step.id,
          stepName: step.name,
          status: 'failed',
          durationMs: Date.now() - startedAt,
          error: message,
        });
        this.transition('failed');
        await this.persist();
        return;
      }
    }

    if (this.state === 'running' && this.currentStepIndex >= this.steps.length) {
      this.transition('completed');
      await this.persist();
      log.info('completed', { skillId: this.id });
    }
  }

  /** Validated state transition. Records a transition trace entry. */
  private transition(target: SkillState): void {
    if (!this.canTransitionTo(target)) {
      throw new Error(
        `Illegal state transition: "${this.state}" -> "${target}"`
      );
    }
    this.recordTransition(target);
  }

  /**
   * Unvalidated transition used only by rollback, which legitimately unwinds
   * from terminal states the normal machine forbids.
   */
  private forceTransition(target: SkillState): void {
    this.recordTransition(target);
  }

  private recordTransition(target: SkillState): void {
    const from = this.state;
    this.state = target;
    this.trace.push({
      type: 'transition',
      timestamp: new Date(),
      fromState: from,
      toState: target,
    });
  }

  /** Persist the current checkpoint if a store was supplied. Best-effort. */
  private async persist(): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.save(this.getCheckpoint());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('checkpoint persist failed', { skillId: this.id, error: message });
    }
  }

  /**
   * Rebuild a runtime from a persisted checkpoint. The caller must supply the
   * step definitions (functions cannot be serialized) — typically via the
   * registry factory that produced the skill originally.
   */
  static fromCheckpoint(
    checkpoint: Checkpoint,
    steps: Step[],
    options: SkillRuntimeOptions = {}
  ): SkillRuntime {
    const runtime = new SkillRuntime(
      checkpoint.skillId,
      checkpoint.intent,
      steps,
      checkpoint.context,
      options
    );
    runtime.state = checkpoint.state;
    runtime.currentStepIndex = checkpoint.currentStepIndex;
    runtime.completedSteps.push(...checkpoint.completedSteps);
    for (const [key, value] of checkpoint.stepResults.entries()) {
      runtime.stepResults.set(key, value);
    }
    return runtime;
  }
}

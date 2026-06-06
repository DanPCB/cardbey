import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRuntime } from '../skill.js';
import { InMemoryCheckpointStore } from '../checkpoint_store.js';
import type { SkillContext, Step } from '../types.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function ctx(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    query: 'test query',
    userId: 'user_1',
    conversationId: 'conv_1',
    userHasProducts: true,
    metadata: {},
    ...overrides,
  };
}

describe('SkillRuntime', () => {
  describe('start / execution order', () => {
    it('executes steps in order and completes', async () => {
      const order: string[] = [];
      const steps: Step[] = [
        { id: 'a', name: 'A', execute: async () => { order.push('a'); return 1; } },
        { id: 'b', name: 'B', execute: async () => { order.push('b'); return 2; } },
        { id: 'c', name: 'C', execute: async () => { order.push('c'); return 3; } },
      ];
      const rt = new SkillRuntime('s1', 'intent', steps, ctx());

      expect(rt.getState()).toBe('idle');
      await rt.start();

      expect(order).toEqual(['a', 'b', 'c']);
      expect(rt.getState()).toBe('completed');
      expect(rt.getCurrentStep()).toBe(3);
      expect(rt.getStepResult('b')).toBe(2);
    });

    it('throws if start() is called from a non-idle state', async () => {
      const rt = new SkillRuntime('s1', 'intent', [], ctx());
      await rt.start(); // completes (no steps)
      await expect(rt.start()).rejects.toThrow(/only valid from "idle"/);
    });

    it('marks failed and stops when a step throws', async () => {
      const order: string[] = [];
      const steps: Step[] = [
        { id: 'a', name: 'A', execute: async () => { order.push('a'); } },
        { id: 'b', name: 'B', execute: async () => { throw new Error('boom'); } },
        { id: 'c', name: 'C', execute: async () => { order.push('c'); } },
      ];
      const rt = new SkillRuntime('s1', 'intent', steps, ctx());
      await rt.start();

      expect(order).toEqual(['a']);
      expect(rt.getState()).toBe('failed');
      expect(rt.getCurrentStep()).toBe(1); // failed step not advanced
      const failedTrace = rt.getTrace().find((t) => t.status === 'failed');
      expect(failedTrace?.error).toBe('boom');
    });
  });

  describe('pause / resume', () => {
    it('pauses while a step is in flight, then resumes to completion', async () => {
      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });

      const steps: Step[] = [
        { id: 's1', name: 'one', execute: async () => { order.push('s1'); } },
        { id: 's2', name: 'two', execute: async () => { order.push('s2'); await gate; } },
        { id: 's3', name: 'three', execute: async () => { order.push('s3'); } },
      ];
      const rt = new SkillRuntime('s1', 'intent', steps, ctx());

      const started = rt.start();
      await tick(); // parks inside s2's awaited gate

      expect(rt.getState()).toBe('running');
      await rt.pause();
      expect(rt.getState()).toBe('paused');

      release();
      await started;

      expect(order).toEqual(['s1', 's2']);
      expect(rt.getCurrentStep()).toBe(2);
      expect(rt.getState()).toBe('paused');

      await rt.resume();
      expect(order).toEqual(['s1', 's2', 's3']);
      expect(rt.getState()).toBe('completed');
    });

    it('pause() is only valid from running', async () => {
      const rt = new SkillRuntime('s1', 'intent', [], ctx());
      await expect(rt.pause()).rejects.toThrow(/only valid from "running"/);
    });

    it('resume() is valid from failed and retries the failed step', async () => {
      let attempts = 0;
      const steps: Step[] = [
        { id: 'a', name: 'A', execute: async () => {} },
        {
          id: 'b',
          name: 'B',
          execute: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('transient');
          },
        },
        { id: 'c', name: 'C', execute: async () => {} },
      ];
      const rt = new SkillRuntime('s1', 'intent', steps, ctx());
      await rt.start();
      expect(rt.getState()).toBe('failed');

      await rt.resume();
      expect(attempts).toBe(2);
      expect(rt.getState()).toBe('completed');
    });

    it('resume() throws from idle', async () => {
      const rt = new SkillRuntime('s1', 'intent', [], ctx());
      await expect(rt.resume()).rejects.toThrow(/only valid from "paused" or "failed"/);
    });
  });

  describe('cancel', () => {
    it('cancels from running and forbids further transitions', async () => {
      const rt = new SkillRuntime('s1', 'intent', [{ id: 'a', name: 'A', execute: async () => {} }], ctx());
      // cancel from idle is allowed
      await rt.cancel();
      expect(rt.getState()).toBe('cancelled');
      await expect(rt.pause()).rejects.toThrow();
    });
  });

  describe('rollback', () => {
    it('invokes rollback hooks in reverse order and ends cancelled', async () => {
      const undone: string[] = [];
      const steps: Step[] = [
        { id: 'a', name: 'A', execute: async () => {}, rollback: async () => { undone.push('a'); } },
        { id: 'b', name: 'B', execute: async () => {}, rollback: async () => { undone.push('b'); } },
        { id: 'c', name: 'C', execute: async () => {} }, // no rollback hook
      ];
      const rt = new SkillRuntime('s1', 'intent', steps, ctx());
      await rt.start();
      expect(rt.getState()).toBe('completed');

      await rt.rollback();
      expect(undone).toEqual(['b', 'a']);
      expect(rt.getState()).toBe('cancelled');
      expect(rt.getCurrentStep()).toBe(0);
    });

    it('continues past a failing hook and throws an aggregate error', async () => {
      const undone: string[] = [];
      const steps: Step[] = [
        { id: 'a', name: 'A', execute: async () => {}, rollback: async () => { undone.push('a'); } },
        { id: 'b', name: 'B', execute: async () => {}, rollback: async () => { throw new Error('cannot undo b'); } },
      ];
      const rt = new SkillRuntime('s1', 'intent', steps, ctx());
      await rt.start();

      await expect(rt.rollback()).rejects.toThrow(/failed hook/);
      expect(undone).toEqual(['a']); // a still rolled back despite b failing
      expect(rt.getState()).toBe('cancelled');
    });

    it('is not allowed while running/idle', async () => {
      const rt = new SkillRuntime('s1', 'intent', [], ctx());
      await expect(rt.rollback()).rejects.toThrow(/not valid from "idle"/);
    });
  });

  describe('state machine introspection', () => {
    it('reports legal transitions only', async () => {
      const rt = new SkillRuntime('s1', 'intent', [], ctx());
      expect(rt.canTransitionTo('running')).toBe(true);
      expect(rt.canTransitionTo('completed')).toBe(false); // idle -> completed illegal
      expect(rt.canTransitionTo('paused')).toBe(false);
    });
  });

  describe('checkpoint persistence', () => {
    it('persists a checkpoint after completion', async () => {
      const store = new InMemoryCheckpointStore();
      const steps: Step[] = [
        { id: 'a', name: 'A', execute: async () => ({ ok: true }) },
        { id: 'b', name: 'B', execute: async () => ({ ok: true }) },
      ];
      const rt = new SkillRuntime('skill_persist', 'intent', steps, ctx(), { store });
      await rt.start();

      const list = await store.list('skill_persist');
      expect(list).toHaveLength(1);
      expect(list[0].state).toBe('completed');
      expect(list[0].completedSteps).toEqual(['a', 'b']);
      expect(list[0].stepResults.get('a')).toEqual({ ok: true });
    });

    it('rebuilds a paused runtime from its checkpoint and resumes', async () => {
      const store = new InMemoryCheckpointStore();
      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });

      const makeSteps = (): Step[] => [
        { id: 's1', name: 'one', execute: async () => { order.push('s1'); } },
        { id: 's2', name: 'two', execute: async () => { order.push('s2'); await gate; } },
        { id: 's3', name: 'three', execute: async () => { order.push('s3'); } },
      ];

      const rt = new SkillRuntime('skill_resume', 'my_intent', makeSteps(), ctx(), { store });
      const started = rt.start();
      await tick();
      await rt.pause();
      release();
      await started;
      expect(rt.getState()).toBe('paused');

      // Simulate a fresh process: load checkpoint, rebuild with fresh steps.
      const list = await store.list('skill_resume');
      const restored = SkillRuntime.fromCheckpoint(list[0], makeSteps(), { store });
      expect(restored.getState()).toBe('paused');
      expect(restored.getCurrentStep()).toBe(2);
      expect(restored.intent).toBe('my_intent');

      await restored.resume();
      expect(restored.getState()).toBe('completed');
      expect(order).toEqual(['s1', 's2', 's3']);
    });
  });

  describe('trace', () => {
    it('records step and transition entries', async () => {
      const rt = new SkillRuntime('s1', 'intent', [{ id: 'a', name: 'A', execute: async () => {} }], ctx());
      await rt.start();
      const trace = rt.getTrace();
      expect(trace.some((t) => t.type === 'transition' && t.toState === 'running')).toBe(true);
      expect(trace.some((t) => t.type === 'step' && t.status === 'completed')).toBe(true);
      expect(trace.some((t) => t.type === 'transition' && t.toState === 'completed')).toBe(true);
    });
  });
});

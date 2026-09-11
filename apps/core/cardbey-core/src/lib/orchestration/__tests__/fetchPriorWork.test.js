/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { AgentCoordinator } from '../agentCoordinator.js';
import { createOrchestrationBlackboard } from '../blackboardWriteBuffer.js';

describe('AgentCoordinator.fetchPriorWork', () => {
  it('returns in-memory wave results even when blackboard getEvents is empty', async () => {
    const coordinator = new AgentCoordinator({
      missionId: 'm-prior',
      orchestrationKind: 'campaign_orchestration',
      blackboard: {
        getEvents: vi.fn(async () => ({ events: [] })),
        appendEvent: vi.fn(),
      },
    });

    coordinator.results.set('brief_1', {
      task: { taskId: 'brief_1', agentType: 'brief' },
      settled: {
        status: 'fulfilled',
        value: {
          taskId: 'brief_1',
          agentType: 'brief',
          result: { brief: { objective: 'Promo for CC Cafe' }, stub: false },
          summary: 'Campaign brief: Promo for CC Cafe',
          confidence: 0.85,
        },
      },
    });
    coordinator.results.set('graphics_1', {
      task: { taskId: 'graphics_1', agentType: 'graphics' },
      settled: {
        status: 'fulfilled',
        value: {
          taskId: 'graphics_1',
          agentType: 'graphics',
          result: { graphics: [{ url: 'https://example.com/a.jpg' }], stub: false },
          summary: 'Generated 1 visual',
          confidence: 0.8,
        },
      },
    });

    const priors = await coordinator.fetchPriorWork();
    expect(priors.some((p) => p.agentType === 'brief' && p.result?.brief?.objective)).toBe(true);
    expect(priors.some((p) => p.agentType === 'graphics' && p.result?.graphics?.[0]?.url)).toBe(
      true,
    );
  });

  it('createOrchestrationBlackboard exposes getEvents', async () => {
    const bb = createOrchestrationBlackboard('m-bb');
    expect(typeof bb.getEvents).toBe('function');
  });
});

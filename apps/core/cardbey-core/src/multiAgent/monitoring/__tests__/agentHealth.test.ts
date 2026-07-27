import { describe, expect, it } from 'vitest';
import {
  buildAgentHealthDetails,
  computeHealthScore,
  countActiveAgents,
  countSleepingAgents,
  getMultiAgentConfigHealth,
  resolveUpdateIntervalSeconds,
} from '../dashboard/agentHealth.js';

describe('agentHealth', () => {
  it('builds agent health details from telemetry', () => {
    const details = buildAgentHealthDetails({
      agentPerformance: [
        {
          agentName: 'planner',
          calls: 3,
          successRate: 1,
          averageLatency: 450,
          tokenUsage: 100,
          cost: 0.001,
          errors: [],
        },
      ],
      agentStatuses: { planner: 'up', critic: 'degraded' },
      checkedAt: new Date('2026-07-10T12:00:00.000Z'),
    });

    expect(details).toHaveLength(6);
    expect(details.find((d) => d.name === 'planner')?.latencyMs).toBe(450);
    expect(details.find((d) => d.name === 'critic')?.status).toBe('degraded');
  });

  it('counts active and sleeping agents', () => {
    const details = buildAgentHealthDetails({
      agentPerformance: [],
      agentStatuses: {},
    });
    expect(countActiveAgents(details)).toBe(6);
    expect(countSleepingAgents(details)).toBe(6);
  });

  it('computes health score with freshness and config penalties', () => {
    const details = buildAgentHealthDetails({
      agentPerformance: [],
      agentStatuses: { planner: 'down' },
    });
    const score = computeHealthScore({
      successRate: 0.9,
      configValid: false,
      isFresh: false,
      agentDetails: details,
    });
    expect(score).toBeLessThan(80);
  });

  it('reads config health flags', () => {
    const flags = getMultiAgentConfigHealth(1200);
    expect(typeof flags.configValid).toBe('boolean');
    expect(typeof flags.healthChecks).toBe('boolean');
    expect(flags.capacityAvailable).toBe(true);
  });

  it('resolves update interval seconds', () => {
    expect(resolveUpdateIntervalSeconds()).toBeGreaterThan(0);
  });
});

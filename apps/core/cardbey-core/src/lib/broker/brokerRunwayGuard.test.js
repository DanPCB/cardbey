import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  guardBrokerDirectAction,
  guardBrokerOrchestraStart,
  extractMissionIdFromRequestBody,
} from './brokerRunwayGuard.js';
import { resetExecutionModeForTests } from '../runtime/executionMode.js';

describe('brokerRunwayGuard', () => {
  const flags = {
    direct: process.env.BROKER_BLOCK_DIRECT_ACTION,
    orchestra: process.env.BROKER_BLOCK_ORCHESTRA_WITH_MISSION,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(flags)) {
      const name = k === 'direct' ? 'BROKER_BLOCK_DIRECT_ACTION' : 'BROKER_BLOCK_ORCHESTRA_WITH_MISSION';
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  });

  beforeEach(() => {
    resetExecutionModeForTests();
    delete process.env.EXECUTION_MODE;
    delete process.env.BROKER_BLOCK_DIRECT_ACTION;
    delete process.env.BROKER_BLOCK_ORCHESTRA_WITH_MISSION;
    process.env.EXECUTION_MODE = 'hybrid';
  });

  it('extracts missionId from nested body', () => {
    expect(extractMissionIdFromRequestBody({ request: { missionId: 'm-1' } })).toBe('m-1');
  });

  it('does not block when flags off', () => {
    expect(guardBrokerDirectAction().blocked).toBe(false);
    expect(guardBrokerOrchestraStart({ missionId: 'm-1' }).blocked).toBe(false);
  });

  it('blocks direct action when flag on', () => {
    process.env.EXECUTION_MODE = 'kernel';
    resetExecutionModeForTests();
    expect(guardBrokerDirectAction().blocked).toBe(true);
  });

  it('blocks orchestra with missionId when flag on', () => {
    process.env.BROKER_BLOCK_ORCHESTRA_WITH_MISSION = 'true';
    const g = guardBrokerOrchestraStart({ missionId: 'm-99' });
    expect(g.blocked).toBe(true);
    expect(g.missionId).toBe('m-99');
  });
});

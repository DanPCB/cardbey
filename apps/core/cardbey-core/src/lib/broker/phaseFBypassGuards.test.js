import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guardPhaseFDraftStoreRunway,
  guardPhaseFMcpDispatch,
  guardPhaseFOrchestraStart,
  guardPhaseFProactiveStepLegacy,
} from './phaseFBypassGuards.js';
import { resetPhaseFBypassMetrics, getPhaseFBypassMetrics } from './phaseFBypassStaging.js';

const envBackup = { ...process.env };

beforeEach(() => {
  resetPhaseFBypassMetrics();
  process.env.PHASE_F_BYPASS_TELEMETRY = 'true';
  delete process.env.PHASE_F_BLOCK_MCP_DIRECT_DISPATCH;
  delete process.env.PHASE_F_ROUTE_MCP_VIA_FACADE;
  delete process.env.PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY;
  delete process.env.PHASE_F_BLOCK_DRAFT_STORE_RUNWAY;
  delete process.env.BROKER_BLOCK_ORCHESTRA_WITH_MISSION;
  delete process.env.ENABLE_RUNTIME_STEP_EXECUTION;
});

afterEach(() => {
  process.env = { ...envBackup };
});

describe('guardPhaseFOrchestraStart', () => {
  it('records mission-bound orchestra starts', () => {
    guardPhaseFOrchestraStart({ missionId: 'm-1', goal: 'build_store' });
    expect(getPhaseFBypassMetrics().orchestraStartWithMission).toBe(1);
  });

  it('blocks when BROKER_BLOCK_ORCHESTRA_WITH_MISSION=true', () => {
    process.env.BROKER_BLOCK_ORCHESTRA_WITH_MISSION = 'true';
    const g = guardPhaseFOrchestraStart({ missionId: 'm-1' });
    expect(g.blocked).toBe(true);
    expect(g.code).toBe('BROKER_ORCHESTRA_BYPASS_BLOCKED');
    expect(getPhaseFBypassMetrics().orchestraStartBlocked).toBe(1);
  });
});

describe('guardPhaseFMcpDispatch', () => {
  it('blocks orphan MCP dispatch when flag on', () => {
    process.env.PHASE_F_BLOCK_MCP_DIRECT_DISPATCH = 'true';
    const g = guardPhaseFMcpDispatch({ executionSource: 'external_mcp_client' });
    expect(g.blocked).toBe(true);
    expect(g.code).toBe('PHASE_F_MCP_DIRECT_DISPATCH_BLOCKED');
  });

  it('allows runtime-owned MCP dispatch when block flag on', () => {
    process.env.PHASE_F_BLOCK_MCP_DIRECT_DISPATCH = 'true';
    const g = guardPhaseFMcpDispatch({ runtimeOwned: true });
    expect(g.blocked).toBe(false);
  });

  it('signals facade when PHASE_F_ROUTE_MCP_VIA_FACADE=true', () => {
    process.env.PHASE_F_ROUTE_MCP_VIA_FACADE = 'true';
    const g = guardPhaseFMcpDispatch({});
    expect(g.useFacade).toBe(true);
    expect(g.blocked).toBe(false);
    expect(getPhaseFBypassMetrics().mcpFacadeDispatch).toBe(1);
  });
});

describe('guardPhaseFProactiveStepLegacy', () => {
  it('blocks legacy path when flags require kernel', () => {
    process.env.PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY = 'true';
    const g = guardPhaseFProactiveStepLegacy();
    expect(g.blocked).toBe(true);
    expect(g.code).toBe('PHASE_F_PROACTIVE_STEP_LEGACY_BLOCKED');
  });

  it('allows when kernel step execution enabled', () => {
    process.env.ENABLE_RUNTIME_STEP_EXECUTION = 'true';
    process.env.PHASE_F_BLOCK_PROACTIVE_STEP_LEGACY = 'true';
    const g = guardPhaseFProactiveStepLegacy();
    expect(g.blocked).toBe(false);
    expect(g.reason).toBe('kernel_active');
  });
});

describe('guardPhaseFDraftStoreRunway', () => {
  it('records direct mutation without mission', () => {
    guardPhaseFDraftStoreRunway({ route: 'POST /:draftId/publish', draftId: 'd-1' });
    expect(getPhaseFBypassMetrics().draftStoreDirectMutation).toBe(1);
  });

  it('blocks when PHASE_F_BLOCK_DRAFT_STORE_RUNWAY=true and no mission', () => {
    process.env.PHASE_F_BLOCK_DRAFT_STORE_RUNWAY = 'true';
    const g = guardPhaseFDraftStoreRunway({ route: 'POST /:draftId/publish' });
    expect(g.blocked).toBe(true);
    expect(g.code).toBe('PHASE_F_DRAFT_STORE_RUNWAY_BLOCKED');
  });
});

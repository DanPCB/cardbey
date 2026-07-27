/**
 * Multi-agent orchestration confirmation governance tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  requiresConfirmation,
  isTrustedOrchestrationSkip,
  resolveOrchestrationDispatchOptions,
  createOrchestrationGovernanceTrace,
  appendOrchestrationGovernanceTrace,
  resetOrchestrationGovernanceAuditForTests,
  MULTI_AGENT_PROPOSED_ACTION,
} from '../../src/lib/orchestration/multiAgentGovernance.js';

describe('multiAgentGovernance', () => {
  beforeEach(() => {
    resetOrchestrationGovernanceAuditForTests();
    process.env.MULTI_AGENT_REQUIRE_CONFIRMATION = 'true';
  });

  it('requires confirmation for multi_agent and campaign_orchestration mission types', () => {
    expect(requiresConfirmation('multi_agent')).toBe(true);
    expect(requiresConfirmation('campaign_orchestration')).toBe(true);
    expect(requiresConfirmation('create_store')).toBe(false);
  });

  it('requires confirmation for persistent artifact actions', () => {
    expect(requiresConfirmation(null, 'create_campaign')).toBe(true);
    expect(requiresConfirmation(null, 'setup_loyalty_program')).toBe(true);
    expect(requiresConfirmation(null, 'general_chat')).toBe(false);
  });

  it('honors MULTI_AGENT_REQUIRE_CONFIRMATION=false feature flag', () => {
    process.env.MULTI_AGENT_REQUIRE_CONFIRMATION = 'false';
    expect(requiresConfirmation('multi_agent')).toBe(false);
  });

  it('allows trusted skipConfirmation only for super_admin', () => {
    const req = { user: { role: 'owner' }, get: () => '' };
    expect(isTrustedOrchestrationSkip(req, { skipConfirmation: true })).toBe(false);

    const adminReq = { user: { role: 'super_admin' }, get: () => '' };
    expect(isTrustedOrchestrationSkip(adminReq, { skipConfirmation: true })).toBe(true);
    expect(requiresConfirmation('multi_agent', 'multi_agent', { skipConfirmation: true })).toBe(false);
  });

  it('builds dispatch options with confirmation required by default', () => {
    const req = { user: { id: 'user-1', role: 'owner' }, get: () => '' };
    const options = resolveOrchestrationDispatchOptions(req, {}, { missionType: 'multi_agent' });
    expect(options.requireConfirmation).toBe(true);
    expect(options.confirmed).toBe(false);
    expect(options.source).toBe('agent_orchestration');
  });

  it('records governance trace with multi_agent_orchestration proposedAction', () => {
    const trace = appendOrchestrationGovernanceTrace(
      createOrchestrationGovernanceTrace({
        sourceIntent: 'Launch winter campaign',
        confirmationState: 'pending',
        missionType: 'campaign_orchestration',
      }),
    );
    expect(trace.proposedAction).toBe(MULTI_AGENT_PROPOSED_ACTION);
    expect(trace.confirmationState).toBe('pending');
    expect(trace.timestamp).toBeTruthy();
  });

  it('allows skip confirmation for configured internal user ids', () => {
    process.env.MULTI_AGENT_SKIP_CONFIRMATION_USERS = 'ops-user-1';
    const req = { user: { id: 'ops-user-1', role: 'owner' }, get: () => '' };
    expect(isTrustedOrchestrationSkip(req, { skipConfirmation: true })).toBe(true);
  });

  it('requires confirmation for persist_package payload flags', () => {
    expect(requiresConfirmation('generic', { persistPackage: true })).toBe(true);
    expect(requiresConfirmation('generic', { createArtifacts: true })).toBe(true);
  });
});

describe('unifiedDispatch orchestration confirmation gate', () => {
  beforeEach(() => {
    resetOrchestrationGovernanceAuditForTests();
    process.env.MULTI_AGENT_REQUIRE_CONFIRMATION = 'true';
    process.env.MULTI_AGENT_ENABLED = 'false';
    vi.resetModules();
  });

  it('returns pending_confirmation before pipeline auto-run when not confirmed', async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: 'mission-pending', status: 'awaiting_confirmation' });
    vi.doMock('../../src/lib/orchestration/createMissionPipeline.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        createOrchestrationMissionPipeline: createSpy,
      };
    });

    const { unifiedDispatch } = await import('../../src/lib/intake/unifiedDispatch.js');
    const result = await unifiedDispatch(
      {
        type: 'multi_agent',
        payload: {
          userMessage: 'Run a multi-step campaign build',
          actorId: 'actor-1',
          body: { message: 'Run a multi-step campaign build' },
        },
      },
      { requireConfirmation: true, confirmed: false, source: 'agent_orchestration' },
    );

    expect(result.status).toBe('pending_confirmation');
    expect(result.proposedAction).toBe(MULTI_AGENT_PROPOSED_ACTION);
    expect(result.governanceTrace?.confirmationState).toBe('pending');
    expect(result.missionId).toBe('mission-pending');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.proposal?.pipelineId).toBe('mission-pending');
  });

  it('creates and runs pipeline when confirmed', async () => {
    const createSpy = vi.fn().mockResolvedValue({ id: 'mission-1', status: 'queued' });
    const runSpy = vi.fn().mockResolvedValue({ stoppedReason: 'completed' });
    vi.doMock('../../src/lib/orchestration/createMissionPipeline.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        createOrchestrationMissionPipeline: createSpy,
      };
    });
    vi.doMock('../../src/lib/missionPipelineOrchestrator.js', () => ({
      runMissionUntilBlocked: runSpy,
    }));
    vi.doMock('../../src/multiAgent/deepseekIntakeBridge.ts', () => ({
      enrichMultiAgentDispatchMetadata: async (meta) => meta,
    }));

    const { unifiedDispatch } = await import('../../src/lib/intake/unifiedDispatch.js');
    const result = await unifiedDispatch(
      {
        type: 'campaign_orchestration',
        payload: {
          userMessage: 'Create a summer campaign',
          actorId: 'actor-1',
          body: { message: 'Create a summer campaign' },
        },
      },
      { requireConfirmation: true, confirmed: true, source: 'agent_orchestration' },
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0].confirmed).toBe(true);
    expect(runSpy).toHaveBeenCalledWith('mission-1');
    expect(result.action).toBe('campaign_orchestration_dispatched');
    expect(result.governanceTrace?.confirmationState).toBe('confirmed');
  });
});

describe('confirmOrchestrationPipeline', () => {
  beforeEach(() => {
    resetOrchestrationGovernanceAuditForTests();
    vi.unmock('../../src/lib/orchestration/createMissionPipeline.js');
    vi.resetModules();
  });

  it('rejects confirmation when pipeline is not awaiting_confirmation', async () => {
    vi.doMock('../../src/lib/prisma.js', () => ({
      getPrismaClient: () => ({
        missionPipeline: {
          findUnique: async () => ({
            id: 'p1',
            type: 'multi_agent',
            status: 'queued',
            requiresConfirmation: false,
            metadataJson: {},
            createdBy: 'u1',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: vi.fn(),
        },
      }),
    }));

    const { confirmOrchestrationPipeline } = await import(
      '../../src/lib/orchestration/createMissionPipeline.js'
    );
    await expect(confirmOrchestrationPipeline('p1', 'u1')).rejects.toThrow(
      'is not pending approval',
    );
  });
});

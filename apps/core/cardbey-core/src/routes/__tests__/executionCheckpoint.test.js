/**
 * Phase 6 — unified execution checkpoint API.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callOrder = [];
const { missionUpdateMock } = vi.hoisted(() => ({
  missionUpdateMock: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

vi.mock('../../lib/missionAccess.js', () => ({
  resolveAccessibleMission: vi.fn(async () => ({ ok: true, kind: 'mission_pipeline' })),
}));

vi.mock('../../lib/missionPipelineOrchestrator.js', () => ({
  runMissionUntilBlocked: vi.fn(async () => ({
    stepsRun: 1,
    stoppedReason: 'checkpoint',
    status: 'awaiting_input',
  })),
}));

vi.mock('../../lib/missionCompletion/postMissionSummary.js', () => ({
  runPostMissionCompletionSummary: vi.fn(async () => {
    callOrder.push('summary');
  }),
}));

vi.mock('../../lib/orchestrator/pipelineCanonicalResults.js', () => ({
  buildRunnerDualWriteMetadataJson: vi.fn(async () => null),
}));

vi.mock('../../lib/missionPipelineTransitions.js', () => ({
  canTransitionMissionPipeline: vi.fn(() => true),
}));

vi.mock('../../lib/execution/executionNotificationEmitter.js', () => ({
  emitExecutionNotification: vi.fn(async () => ({})),
  EXECUTION_EVENT_TYPES: {
    CHECKPOINT_RESOLVED: 'execution.checkpoint.resolved',
    COMPLETED: 'execution.completed',
  },
}));

vi.mock('../../lib/artifactCheckpointAuthority.js', () => ({
  isArtifactCheckpointDeferredRespond: vi.fn(() => false),
}));

vi.mock('../../lib/prisma.js', () => {
  const missionPipeline = {
    findUnique: vi.fn(),
    update: missionUpdateMock,
  };
  const missionPipelineStep = {
    update: vi.fn(),
  };
  return {
    getPrismaClient: () => ({
      missionPipeline,
      missionPipelineStep,
      $transaction: async (fn) =>
        fn({
          missionPipeline: { update: missionUpdateMock },
          missionPipelineStep: { update: vi.fn() },
        }),
    }),
    __missionPipeline: missionPipeline,
  };
});

import { __missionPipeline } from '../../lib/prisma.js';
import executionRoutes from '../executionRoutes.js';
import missionsRoutes from '../missionsRoutes.js';

function pipelineFixture(missionId, stepId) {
  return {
    id: missionId,
    status: 'awaiting_input',
    type: 'store',
    progressCompletedSteps: 0,
    outputsJson: {},
    metadataJson: {},
    steps: [
      {
        id: stepId,
        status: 'awaiting_input',
        orderIndex: 0,
        configJson: { outputKey: 'logoChoice' },
      },
    ],
  };
}

function makeApp(mountPath, router) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-checkpoint-test' };
    next();
  });
  app.use(mountPath, router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, error: 'test_error', message: err?.message ?? String(err) });
  });
  return app;
}

describe('POST /api/execution/:executionId/checkpoint', () => {
  const executionId = 'exec_unified_1';
  const stepId = 'step_logo';

  beforeEach(() => {
    callOrder.length = 0;
    missionUpdateMock.mockReset();
    __missionPipeline.findUnique.mockReset();
    __missionPipeline.findUnique
      .mockResolvedValueOnce(pipelineFixture(executionId, stepId))
      .mockResolvedValueOnce({
        ...pipelineFixture(executionId, stepId),
        status: 'executing',
        runState: 'running',
        steps: [{ id: stepId, status: 'completed' }],
      });
  });

  it('responds to checkpoint and returns unified envelope', async () => {
    const res = await request(makeApp('/api/execution', executionRoutes))
      .post(`/api/execution/${executionId}/checkpoint`)
      .send({ stepId, response: 'Skip' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resumed).toBe(true);
    expect(res.body.executionId).toBe(executionId);
    expect(res.body.missionId).toBe(executionId);
    expect(res.body.stepId).toBe(stepId);
    expect(res.body.orchestration).toEqual(
      expect.objectContaining({ stepsRun: 1, status: 'awaiting_input' }),
    );
  });

  it('validates stepId is required', async () => {
    const res = await request(makeApp('/api/execution', executionRoutes))
      .post(`/api/execution/${executionId}/checkpoint`)
      .send({ response: 'Skip' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

describe('deprecated POST /api/missions/:missionId/respond', () => {
  const missionId = 'm_legacy_respond';
  const stepId = 'step_legacy';

  beforeEach(() => {
    __missionPipeline.findUnique.mockReset();
    __missionPipeline.findUnique
      .mockResolvedValueOnce(pipelineFixture(missionId, stepId))
      .mockResolvedValueOnce({
        ...pipelineFixture(missionId, stepId),
        status: 'executing',
        runState: 'running',
        steps: [{ id: stepId, status: 'completed' }],
      });
  });

  it('still works and sets deprecation headers', async () => {
    const res = await request(makeApp('/api/missions', missionsRoutes))
      .post(`/api/missions/${missionId}/respond`)
      .send({ stepId, response: 'Skip' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.executionId).toBe(missionId);
    expect(res.headers.deprecation).toBe('true');
    expect(String(res.headers['x-api-deprecated'] ?? '')).toContain('/api/execution/');
  });
});

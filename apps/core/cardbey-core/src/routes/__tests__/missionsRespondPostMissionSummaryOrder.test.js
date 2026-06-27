/**
 * DANH: validate_and_fix_next_steps — POST /respond fires summary after status=completed.
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
  getTenantId: vi.fn(),
}));

vi.mock('../../lib/missionPipelineOrchestrator.js', () => ({
  runMissionUntilBlocked: vi.fn(async () => ({
    stepsRun: 1,
    stoppedReason: 'completed',
    status: 'completed',
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
import { runPostMissionCompletionSummary } from '../../lib/missionCompletion/postMissionSummary.js';
import missionsRoutes from '../missionsRoutes.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-respond-test' };
    next();
  });
  app.use('/api/missions', missionsRoutes);
  return app;
}

describe('POST /api/missions/:missionId/respond completion ordering', () => {
  const missionId = 'm_respond_order';
  const stepId = 's_checkpoint_1';

  beforeEach(() => {
    callOrder.length = 0;
    missionUpdateMock.mockReset();
    missionUpdateMock.mockImplementation(async (args) => {
      if (args?.data?.status === 'completed') callOrder.push('completed_update');
      return {};
    });

    __missionPipeline.findUnique
      .mockResolvedValueOnce({
        id: missionId,
        status: 'awaiting_input',
        type: 'store',
        progressCompletedSteps: 2,
        outputsJson: {},
        metadataJson: {},
        steps: [
          {
            id: stepId,
            status: 'awaiting_input',
            orderIndex: 2,
            configJson: { outputKey: 'ownerResponse' },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: missionId,
        status: 'executing',
        runState: 'running',
        type: 'store',
        steps: [{ id: stepId, status: 'completed' }],
      })
      .mockResolvedValueOnce({
        id: missionId,
        type: 'store',
        status: 'executing',
        runState: 'running',
        outputsJson: { storeName: 'Cafe' },
        metadataJson: {},
      });
  });

  it('fires postMissionSummary when respond completes the mission', async () => {
    const res = await request(makeApp())
      .post(`/api/missions/${missionId}/respond`)
      .send({ stepId, response: 'yes' });

    expect(res.status).toBe(200);
    // Summary runs fire-and-forget after status=completed.
    // Ordering between summary and status is not guaranteed.
    expect(runPostMissionCompletionSummary).toHaveBeenCalledTimes(1);
    expect(runPostMissionCompletionSummary).toHaveBeenCalledWith(
      expect.objectContaining({ missionId }),
    );
  });
});


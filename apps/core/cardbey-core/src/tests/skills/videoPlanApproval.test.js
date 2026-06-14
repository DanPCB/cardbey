// DANH: plan-first-video-approval
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillExecutor, clearSkillExecutionStoreForTests } from '../../lib/skills/SkillExecutor.js';
import { VideoGenerationSkill } from '../../lib/skills/definitions/VideoGenerationSkill.js';
import { validatePlanArtifact } from '../../lib/skills/planApprovalSchema.js';
import { execute as videoPlanExecute } from '../../lib/toolExecutors/video/video_plan.js';
import { execute as videoExecute } from '../../lib/toolExecutors/video/video_execute.js';
import { SKILL_STATUS_AWAITING_PLAN_APPROVAL } from '../../lib/skills/planApprovalConstants.js';

const klingSpy = vi.fn(async () => ({
  status: 'ok',
  output: { queued: true, completed: true, videoUrl: 'https://example.com/v.mp4', taskId: 't1' },
}));

vi.mock('../../lib/toolExecutors/video/queue_video_generation.js', () => ({
  execute: (...args) => klingSpy(...args),
}));

describe('Video plan-first approval', () => {
  beforeEach(() => {
    clearSkillExecutionStoreForTests();
    klingSpy.mockClear();
  });

  it('video_plan returns plan artifact without calling Kling', async () => {
    const result = await videoPlanExecute({
      storeId: 'store-1',
      userMessage: 'promo video for my store',
    });
    expect(result.status).toBe('ok');
    expect(result.output?.plan?.script).toBeTruthy();
    expect(result.output?.plan?.scenes?.length).toBeGreaterThan(0);
    expect(klingSpy).not.toHaveBeenCalled();
  });

  it('video_execute rejects without approved plan', async () => {
    const result = await videoExecute({});
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('PLAN_NOT_APPROVED');
    expect(klingSpy).not.toHaveBeenCalled();
  });

  it('SkillExecutor pauses at awaiting_plan_approval after plan step', async () => {
    const dispatched = [];
    const executor = new SkillExecutor({
      toolDispatcher: async (tool, input) => {
        dispatched.push(tool);
        if (tool === 'video_plan') return videoPlanExecute(input);
        if (tool === 'video_execute') return videoExecute(input);
        return { status: 'failed', error: { message: `unexpected tool ${tool}` } };
      },
      blackboard: {
        appendEvent: vi.fn(async () => ({})),
      },
    });

    const execution = await executor.execute(VideoGenerationSkill, {
      missionId: 'mission-v1',
      userId: 'user-1',
      storeId: 'store-1',
      toolInput: { userMessage: 'create a promo video' },
    });

    expect(execution.status).toBe(SKILL_STATUS_AWAITING_PLAN_APPROVAL);
    expect(execution.canResume).toBe(true);
    expect(execution.planArtifact?.script).toBeTruthy();
    expect(dispatched).toEqual(['video_plan']);
    expect(klingSpy).not.toHaveBeenCalled();
  });

  it('approve resumes and dispatches video_execute with edited plan', async () => {
    const dispatched = [];
    const executor = new SkillExecutor({
      toolDispatcher: async (tool, input) => {
        dispatched.push(tool);
        if (tool === 'video_plan') return videoPlanExecute(input);
        if (tool === 'video_execute') return videoExecute(input);
        return { status: 'failed', error: { message: `unexpected tool ${tool}` } };
      },
      blackboard: { appendEvent: vi.fn(async () => ({})) },
    });

    const paused = await executor.execute(VideoGenerationSkill, {
      missionId: 'mission-v2',
      userId: 'user-1',
      storeId: 'store-1',
      toolInput: { userMessage: 'promo video' },
    });

    const plan = { ...paused.planArtifact, script: 'Edited script for approval test.' };
    const validation = validatePlanArtifact(plan);
    expect(validation.ok).toBe(true);

    const resumed = await executor.resume(paused.id, {
      missionId: 'mission-v2',
      userId: 'user-1',
      storeId: 'store-1',
      approvedPlan: validation.plan,
    });

    expect(resumed.status).toBe('completed');
    expect(dispatched).toContain('video_execute');
    expect(klingSpy).toHaveBeenCalledTimes(1);
    expect(klingSpy.mock.calls[0][0]?.script).toContain('Edited script');
  });

  it('regenerate re-runs plan step only', async () => {
    const dispatched = [];
    const executor = new SkillExecutor({
      toolDispatcher: async (tool, input) => {
        dispatched.push(tool);
        if (tool === 'video_plan') return videoPlanExecute(input);
        if (tool === 'video_execute') return videoExecute(input);
        return { status: 'failed', error: { message: `unexpected tool ${tool}` } };
      },
      blackboard: { appendEvent: vi.fn(async () => ({})) },
    });

    const paused = await executor.execute(VideoGenerationSkill, {
      missionId: 'mission-v3',
      userId: 'user-1',
      storeId: 'store-1',
      toolInput: { userMessage: 'promo video' },
    });

    dispatched.length = 0;
    const regen = await executor.resume(paused.id, {
      missionId: 'mission-v3',
      userId: 'user-1',
      storeId: 'store-1',
      regeneratePlan: true,
      toolInput: { userMessage: 'promo video', feedback: 'make it more energetic' },
    });

    expect(regen.status).toBe(SKILL_STATUS_AWAITING_PLAN_APPROVAL);
    expect(dispatched).toEqual(['video_plan']);
    expect(klingSpy).not.toHaveBeenCalled();
  });

  it('VideoGenerationSkill step list uses plan + execute + audio tools', () => {
    expect(VideoGenerationSkill.steps.map((s) => s.tool)).toEqual([
      'video_plan',
      'video_execute',
      'video_audio',
    ]);
    expect(VideoGenerationSkill.planning?.planFirst).toBe(true);
    expect(VideoGenerationSkill.planning?.expensive).toBe(true);
  });
});

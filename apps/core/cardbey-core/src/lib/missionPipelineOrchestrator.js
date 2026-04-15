/**
 * Mission Step Orchestrator v1 - sequential execution until stopped.
 * Composes single-step pipeline advancement via `executeMissionAction` (`run_pipeline_step`), which delegates to `runNextMissionPipelineStep`.
 * No background queue; runs in-process with a max step guard.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { executeMissionAction } from './execution/executeMissionAction.js';

const DEFAULT_MAX_STEPS = 20;

/**
 * Run mission through pipeline steps until it completes, fails, becomes blocked, is cancelled, or hits maxSteps.
 *
 * @param {string} missionId
 * @param {{ maxSteps?: number }} [options]
 * @returns {Promise<{
 *   ok: boolean;
 *   missionId: string;
 *   status: string;
 *   runState: string;
 *   stepsRun: number;
 *   stoppedReason: 'completed' | 'blocked' | 'failed' | 'cancelled' | 'awaiting_confirmation' | 'no_pending_steps' | 'max_steps_reached' | 'invalid_state' | 'not_found';
 * }>}
 */
export async function runMissionUntilBlocked(missionId, options = {}) {
  console.log('[BLOCKED_DEBUG] runMissionUntilBlocked called:', missionId);
  const id = typeof missionId === 'string' ? missionId.trim() : '';
  const maxSteps = typeof options.maxSteps === 'number' && options.maxSteps > 0 ? options.maxSteps : DEFAULT_MAX_STEPS;

  if (!id) {
    return {
      ok: false,
      missionId: id || missionId,
      status: '',
      runState: '',
      stepsRun: 0,
      stoppedReason: 'invalid_state',
    };
  }

  const prisma = getPrismaClient();
  let stepsRun = 0;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionOrchestrator] starting mission=${id}`);
  }

  const loadMission = async () => {
    const m = await prisma.missionPipeline.findUnique({
      where: { id },
      select: { status: true, runState: true },
    });
    return m;
  };

  let mission = await loadMission();
  if (!mission) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MissionOrchestrator] stop reason=not_found mission=${id}`);
    }
    return {
      ok: false,
      missionId: id,
      status: '',
      runState: '',
      stepsRun: 0,
      stoppedReason: 'not_found',
    };
  }

  if (mission.status !== 'queued' && mission.status !== 'executing') {
    const reason = mission.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : mission.status === 'cancelled' ? 'cancelled' : 'no_pending_steps';
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MissionOrchestrator] stop reason=${reason} mission=${id} status=${mission.status} runState=${mission.runState}`);
    }
    return {
      ok: true,
      missionId: id,
      status: mission.status,
      runState: mission.runState,
      stepsRun: 0,
      stoppedReason: reason,
    };
  }

  while (stepsRun < maxSteps) {
    const fr = await executeMissionAction({
      actionType: 'run_pipeline_step',
      missionId: id,
      source: 'run_mission_until_blocked',
    });
    const runResult =
      fr.output && typeof fr.output === 'object'
        ? fr.output
        : { ok: false, error: fr.error?.code || 'facade_failed' };
    console.log('[BLOCKED_DEBUG] step result:', runResult);

    if (!runResult.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] stop reason=invalid_state mission=${id} status=${mission.status} runState=${mission.runState}`);
      }
      mission = await loadMission();
      return {
        ok: false,
        missionId: id,
        status: (mission && mission.status) || '',
        runState: (mission && mission.runState) || '',
        stepsRun,
        stoppedReason: 'invalid_state',
      };
    }

    if (!runResult.stepRun) {
      mission = await loadMission();
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] stop reason=no_pending_steps mission=${id} status=${mission?.status} runState=${mission?.runState}`);
      }
      return {
        ok: true,
        missionId: id,
        status: (mission && mission.status) || runResult.status || 'queued',
        runState: (mission && mission.runState) || runResult.runState || 'running',
        stepsRun,
        stoppedReason: 'no_pending_steps',
      };
    }

    stepsRun += 1;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MissionOrchestrator] running step ${stepsRun} for mission=${id}`);
    }

    if (runResult.status === 'paused') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] stop reason=blocked mission=${id} status=${runResult.status} runState=${runResult.runState}`);
      }
      return {
        ok: true,
        missionId: id,
        status: runResult.status,
        runState: runResult.runState,
        stepsRun,
        stoppedReason: 'blocked',
      };
    }

    if (runResult.status === 'failed') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] stop reason=failed mission=${id} status=${runResult.status} runState=${runResult.runState}`);
      }
      return {
        ok: true,
        missionId: id,
        status: runResult.status,
        runState: runResult.runState,
        stepsRun,
        stoppedReason: 'failed',
      };
    }

    if (runResult.status === 'completed') {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] stop reason=completed mission=${id} status=${runResult.status} runState=${runResult.runState}`);
      }
      return {
        ok: true,
        missionId: id,
        status: runResult.status,
        runState: runResult.runState,
        stepsRun,
        stoppedReason: 'completed',
      };
    }

    if (stepsRun >= maxSteps) {
      mission = await loadMission();
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] max step guard reached mission=${id}`);
      }
      return {
        ok: true,
        missionId: id,
        status: (mission && mission.status) || 'executing',
        runState: (mission && mission.runState) || 'running',
        stepsRun,
        stoppedReason: 'max_steps_reached',
      };
    }

    mission = await loadMission();
    if (!mission) {
      return {
        ok: false,
        missionId: id,
        status: '',
        runState: '',
        stepsRun,
        stoppedReason: 'not_found',
      };
    }
    if (mission.status !== 'queued' && mission.status !== 'executing') {
      const reason =
        mission.status === 'cancelled'
          ? 'cancelled'
          : mission.status === 'awaiting_confirmation'
            ? 'awaiting_confirmation'
            : 'no_pending_steps';
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MissionOrchestrator] stop reason=${reason} mission=${id} status=${mission.status} runState=${mission.runState}`);
      }
      return {
        ok: true,
        missionId: id,
        status: mission.status,
        runState: mission.runState,
        stepsRun,
        stoppedReason: reason,
      };
    }
  }

  mission = await loadMission();
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[MissionOrchestrator] max step guard reached mission=${id}`);
  }
  return {
    ok: true,
    missionId: id,
    status: (mission && mission.status) || 'executing',
    runState: (mission && mission.runState) || 'running',
    stepsRun,
    stoppedReason: 'max_steps_reached',
  };
}

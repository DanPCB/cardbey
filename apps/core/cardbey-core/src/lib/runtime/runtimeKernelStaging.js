/**
 * Runtime Kernel staging rollout — phase detection for soak + flag enablement.
 * Phases: OFF → FOUNDATION → PHASE_B → PHASE_C → PHASE_D → PHASE_E → FULL
 */

import { getRuntimeCapabilities } from './runtimeCapabilitiesService.js';
import { isRuntimeMissionGraphEnabled } from './runtimeMissionGraphService.js';
import { isRuntimeGraphSchedulerEnabled } from './runtimeGraphScheduler.js';
import { isRuntimeSkillExecutionEnabled } from './skills/runtimeSkillExecutor.js';
import { isRuntimeDurableExecutionEnabled } from './queue/runtimeDurableGraphExecution.js';

function isRuntimeGraphOrchestrationEnabled() {
  return isRuntimeMissionGraphEnabled() && isRuntimeGraphSchedulerEnabled();
}

/** @typedef {'OFF'|'FOUNDATION'|'PHASE_B'|'PHASE_C'|'PHASE_D'|'PHASE_E'|'FULL'} RuntimeKernelRolloutStage */

const STAGE_ORDER = ['OFF', 'FOUNDATION', 'PHASE_B', 'PHASE_C', 'PHASE_D', 'PHASE_E', 'FULL'];

const STAGE_FLAGS = {
  FOUNDATION: [
    'runtimeKernel',
    'runtimeStepExecution',
    'sharedRuntimeToolRegistry',
  ],
  PHASE_B: ['runtimeMissionOrchestrator'],
  PHASE_C: ['runtimeMissionGraph', 'runtimeGraphScheduler'],
  PHASE_D: ['runtimeSkillRuntime', 'runtimeWorkerManager', 'runtimeExecutionLeases'],
  PHASE_E: [
    'runtimeExecutionQueue',
    'runtimeLeaseRecovery',
    'runtimeReplayProtection',
    'runtimeHeartbeatMonitor',
  ],
};

/**
 * @returns {RuntimeKernelRolloutStage}
 */
export function getRuntimeKernelRolloutStage() {
  const caps = getRuntimeCapabilities();

  const foundation =
    caps.runtimeKernel &&
    caps.runtimeStepExecution &&
    caps.sharedRuntimeToolRegistry;

  if (!foundation) return 'OFF';
  if (!caps.runtimeMissionOrchestrator) return 'FOUNDATION';
  if (!isRuntimeGraphOrchestrationEnabled()) return 'PHASE_B';
  if (!isRuntimeSkillExecutionEnabled()) return 'PHASE_C';
  if (!isRuntimeDurableExecutionEnabled()) return 'PHASE_D';
  return 'PHASE_E';
}

function nextStage(stage) {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

function envNameForCapability(cap) {
  const map = {
    runtimeKernel: 'ENABLE_PERFORMER_RUNTIME_KERNEL',
    runtimeStepExecution: 'ENABLE_RUNTIME_STEP_EXECUTION',
    sharedRuntimeToolRegistry: 'ENABLE_SHARED_RUNTIME_TOOL_REGISTRY',
    runtimeMissionOrchestrator: 'ENABLE_RUNTIME_MISSION_ORCHESTRATOR',
    runtimeMissionGraph: 'ENABLE_RUNTIME_MISSION_GRAPH',
    runtimeGraphScheduler: 'ENABLE_RUNTIME_GRAPH_SCHEDULER',
    runtimeSkillRuntime: 'ENABLE_RUNTIME_SKILL_RUNTIME',
    runtimeWorkerManager: 'ENABLE_RUNTIME_WORKER_MANAGER',
    runtimeExecutionLeases: 'ENABLE_RUNTIME_EXECUTION_LEASES',
    runtimeExecutionQueue: 'ENABLE_RUNTIME_EXECUTION_QUEUE',
    runtimeLeaseRecovery: 'ENABLE_RUNTIME_LEASE_RECOVERY',
    runtimeReplayProtection: 'ENABLE_RUNTIME_REPLAY_PROTECTION',
    runtimeHeartbeatMonitor: 'ENABLE_RUNTIME_HEARTBEAT_MONITOR',
  };
  return map[cap] ?? cap;
}

function buildRecommendations(stage) {
  const next = nextStage(stage);
  if (!next || next === 'FULL') {
    return {
      currentStage: stage,
      nextStage: null,
      enableEnv: [],
      rollback: 'Disable Phase E flags first, then D→C→B; keep FOUNDATION until orchestrator path validated.',
    };
  }

  const flags = STAGE_FLAGS[next] ?? [];
  return {
    currentStage: stage,
    nextStage: next,
    enableEnv: flags.map(envNameForCapability),
    rollback: `Set ${flags.map(envNameForCapability).join(', ')}=false and restart API.`,
  };
}

/**
 * Snapshot for GET /api/runtime/capabilities and staging dashboards.
 */
export function getRuntimeKernelStagingSnapshot() {
  const caps = getRuntimeCapabilities();
  const stage = getRuntimeKernelRolloutStage();
  return {
    rolloutStage: stage,
    stageOrder: STAGE_ORDER,
    capabilities: caps,
    phaseFlags: {
      foundation: STAGE_FLAGS.FOUNDATION.every((k) => caps[k] === true),
      phaseB: caps.runtimeMissionOrchestrator === true,
      phaseC: isRuntimeGraphOrchestrationEnabled(),
      phaseD: isRuntimeSkillExecutionEnabled(),
      phaseE: isRuntimeDurableExecutionEnabled(),
    },
    recommendations: buildRecommendations(stage),
  };
}

export default {
  getRuntimeKernelRolloutStage,
  getRuntimeKernelStagingSnapshot,
};

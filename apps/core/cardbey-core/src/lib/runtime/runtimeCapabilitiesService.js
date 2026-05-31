/**
 * Runtime Capability Layer — single boot-time authority for runtime feature flags.
 * Missing env vars → internal warnings only; never expose raw env names to user APIs.
 */

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** @typedef {'runtimeKernel' | 'runtimeStepExecution' | 'runtimeSessionRehydration' | 'runtimeMissionResume' | 'missionHandoff' | 'sharedRuntimeToolRegistry' | 'proactiveExecution' | 'runtimePrerequisiteResolution' | 'runtimeTargetReadiness' | 'runtimeMissionOrchestrator' | 'runtimeMissionGraph' | 'runtimeGraphScheduler' | 'runtimeSkillRuntime' | 'runtimeWorkerManager' | 'runtimeExecutionLeases' | 'runtimeExecutionQueue' | 'runtimeLeaseRecovery' | 'runtimeReplayProtection' | 'runtimeHeartbeatMonitor'} RuntimeCapabilityKey */

/**
 * @typedef {{
 *   ok: true;
 *   runtimeKernel: boolean;
 *   runtimeStepExecution: boolean;
 *   runtimeSessionRehydration: boolean;
 *   runtimeMissionResume: boolean;
 *   missionHandoff: boolean;
 *   sharedRuntimeToolRegistry: boolean;
 *   proactiveExecution: boolean;
 *   runtimePrerequisiteResolution: boolean;
 *   runtimeTargetReadiness: boolean;
 *   runtimeMissionOrchestrator: boolean;
 *   runtimeMissionGraph: boolean;
 *   runtimeGraphScheduler: boolean;
 *   runtimeSkillRuntime: boolean;
 *   runtimeWorkerManager: boolean;
 *   runtimeExecutionLeases: boolean;
 *   runtimeExecutionQueue: boolean;
 *   runtimeLeaseRecovery: boolean;
 *   runtimeReplayProtection: boolean;
 *   runtimeHeartbeatMonitor: boolean;
 * }} RuntimeCapabilities
 */

/** @type {Record<RuntimeCapabilityKey, { env: string, defaultValue: boolean }>} */
const CAPABILITY_SPECS = {
  runtimeKernel: { env: 'ENABLE_PERFORMER_RUNTIME_KERNEL', defaultValue: false },
  runtimeStepExecution: { env: 'ENABLE_RUNTIME_STEP_EXECUTION', defaultValue: false },
  runtimeSessionRehydration: { env: 'ENABLE_RUNTIME_SESSION_REHYDRATION', defaultValue: false },
  runtimeMissionResume: { env: 'ENABLE_RUNTIME_MISSION_RESUME', defaultValue: false },
  missionHandoff: { env: 'ENABLE_MISSION_HANDOFF', defaultValue: false },
  sharedRuntimeToolRegistry: { env: 'ENABLE_SHARED_RUNTIME_TOOL_REGISTRY', defaultValue: false },
  proactiveExecution: { env: 'ENABLE_PROACTIVE_CAMPAIGN_RUNWAY', defaultValue: false },
  runtimePrerequisiteResolution: { env: 'ENABLE_RUNTIME_PREREQUISITE_RESOLUTION', defaultValue: false },
  runtimeTargetReadiness: { env: 'ENABLE_RUNTIME_TARGET_READINESS', defaultValue: false },
  runtimeMissionOrchestrator: { env: 'ENABLE_RUNTIME_MISSION_ORCHESTRATOR', defaultValue: false },
  runtimeMissionGraph: { env: 'ENABLE_RUNTIME_MISSION_GRAPH', defaultValue: false },
  runtimeGraphScheduler: { env: 'ENABLE_RUNTIME_GRAPH_SCHEDULER', defaultValue: false },
  runtimeSkillRuntime: { env: 'ENABLE_RUNTIME_SKILL_RUNTIME', defaultValue: false },
  runtimeWorkerManager: { env: 'ENABLE_RUNTIME_WORKER_MANAGER', defaultValue: false },
  runtimeExecutionLeases: { env: 'ENABLE_RUNTIME_EXECUTION_LEASES', defaultValue: false },
  runtimeExecutionQueue: { env: 'ENABLE_RUNTIME_EXECUTION_QUEUE', defaultValue: false },
  runtimeLeaseRecovery: { env: 'ENABLE_RUNTIME_LEASE_RECOVERY', defaultValue: false },
  runtimeReplayProtection: { env: 'ENABLE_RUNTIME_REPLAY_PROTECTION', defaultValue: false },
  runtimeHeartbeatMonitor: { env: 'ENABLE_RUNTIME_HEARTBEAT_MONITOR', defaultValue: false },
};

/** @type {RuntimeCapabilities | null} */
let cachedCapabilities = null;

/** @type {Array<{ type: string; capability: string; detail?: string; at: string }>} */
const capabilityEvents = [];

/**
 * @param {'missing' | 'disabled' | 'invalid'} type
 * @param {RuntimeCapabilityKey} capability
 * @param {{ source?: string; missionId?: string | null; detail?: string }} [context]
 */
export function logRuntimeCapabilityEvent(type, capability, context = {}) {
  const entry = {
    type: `runtime.capability.${type}`,
    capability,
    detail: context.detail ?? context.source ?? undefined,
    at: new Date().toISOString(),
  };
  capabilityEvents.push(entry);
  if (capabilityEvents.length > 200) capabilityEvents.shift();

  const missionSuffix = context.missionId ? ` missionId=${context.missionId}` : '';
  console.warn(
    `[RuntimeCapabilities] ${entry.type} capability=${capability}${missionSuffix}${entry.detail ? ` detail=${entry.detail}` : ''}`,
  );
}

/**
 * Compute capabilities once at boot (idempotent).
 * @returns {RuntimeCapabilities}
 */
export function initRuntimeCapabilities() {
  if (cachedCapabilities) return cachedCapabilities;

  /** @type {Record<string, boolean>} */
  const caps = {};
  for (const [key, spec] of Object.entries(CAPABILITY_SPECS)) {
    const raw = process.env[spec.env];
    const unset = raw === undefined || raw === null || String(raw).trim() === '';
    if (unset && !spec.defaultValue) {
      logRuntimeCapabilityEvent('missing', /** @type {RuntimeCapabilityKey} */ (key), {
        detail: spec.env,
      });
      caps[key] = false;
      continue;
    }
    const enabled = envTruthy(spec.env, spec.defaultValue);
    caps[key] = enabled;
    if (!enabled && !unset) {
      logRuntimeCapabilityEvent('disabled', /** @type {RuntimeCapabilityKey} */ (key), {
        detail: spec.env,
      });
    }
  }

  cachedCapabilities = {
    ok: true,
    runtimeKernel: Boolean(caps.runtimeKernel),
    runtimeStepExecution: Boolean(caps.runtimeStepExecution),
    runtimeSessionRehydration: Boolean(caps.runtimeSessionRehydration),
    runtimeMissionResume: Boolean(caps.runtimeMissionResume),
    missionHandoff: Boolean(caps.missionHandoff),
    sharedRuntimeToolRegistry: Boolean(caps.sharedRuntimeToolRegistry),
    proactiveExecution: Boolean(caps.proactiveExecution),
    runtimePrerequisiteResolution: Boolean(caps.runtimePrerequisiteResolution),
    runtimeTargetReadiness: Boolean(caps.runtimeTargetReadiness),
    runtimeMissionOrchestrator: Boolean(caps.runtimeMissionOrchestrator),
    runtimeMissionGraph: Boolean(caps.runtimeMissionGraph),
    runtimeGraphScheduler: Boolean(caps.runtimeGraphScheduler),
    runtimeSkillRuntime: Boolean(caps.runtimeSkillRuntime),
    runtimeWorkerManager: Boolean(caps.runtimeWorkerManager),
    runtimeExecutionLeases: Boolean(caps.runtimeExecutionLeases),
    runtimeExecutionQueue: Boolean(caps.runtimeExecutionQueue),
    runtimeLeaseRecovery: Boolean(caps.runtimeLeaseRecovery),
    runtimeReplayProtection: Boolean(caps.runtimeReplayProtection),
    runtimeHeartbeatMonitor: Boolean(caps.runtimeHeartbeatMonitor),
  };

  return cachedCapabilities;
}

/** @returns {RuntimeCapabilities} */
export function getRuntimeCapabilities() {
  return initRuntimeCapabilities();
}

/**
 * @param {RuntimeCapabilityKey} capability
 * @param {{ source?: string; missionId?: string | null }} [context]
 */
export function isRuntimeCapabilityEnabled(capability, context = {}) {
  const caps = getRuntimeCapabilities();
  const enabled = Boolean(caps[capability]);
  if (!enabled) {
    logRuntimeCapabilityEvent('missing', capability, context);
  }
  return enabled;
}

/**
 * @param {RuntimeCapabilityKey} capability
 * @param {{ source?: string; missionId?: string | null }} [context]
 * @returns {{ ok: true } | { ok: false; code: string; capability: RuntimeCapabilityKey; message: string }}
 */
export function requireRuntimeCapability(capability, context = {}) {
  const caps = getRuntimeCapabilities();
  if (caps[capability]) {
    return { ok: true };
  }
  logRuntimeCapabilityEvent('missing', capability, context);
  return {
    ok: false,
    code: 'RUNTIME_CAPABILITY_UNAVAILABLE',
    capability,
    message: userMessageForCapability(capability),
  };
}

/** User-safe message — never includes env var names. */
export function userMessageForCapability(capability) {
  switch (capability) {
    case 'runtimeStepExecution':
      return 'Mission step execution is not available in this environment. Your plan is saved — try again later or contact support.';
    case 'runtimeSessionRehydration':
      return 'Session recovery is not available in this environment.';
    case 'runtimeMissionResume':
      return 'Mission resume is not available in this environment.';
    case 'runtimeKernel':
      return 'The runtime engine is not available in this environment.';
    case 'missionHandoff':
      return 'Mission continuation is not available in this environment.';
    case 'sharedRuntimeToolRegistry':
      return 'Shared runtime tools are not available in this environment.';
    case 'proactiveExecution':
      return 'Proactive mission execution is not available in this environment.';
    case 'runtimePrerequisiteResolution':
      return 'Prerequisite resolution is not available in this environment.';
    case 'runtimeTargetReadiness':
      return 'Target readiness is not available in this environment.';
    case 'runtimeMissionOrchestrator':
      return 'Mission orchestration is not available in this environment.';
    case 'runtimeMissionGraph':
      return 'Mission graph orchestration is not available in this environment.';
    case 'runtimeGraphScheduler':
      return 'Graph scheduling is not available in this environment.';
    case 'runtimeSkillRuntime':
      return 'Skill-based execution is not available in this environment.';
    case 'runtimeWorkerManager':
      return 'Worker execution is not available in this environment.';
    case 'runtimeExecutionLeases':
      return 'Execution lease coordination is not available in this environment.';
    case 'runtimeExecutionQueue':
      return 'Execution queue is not available in this environment.';
    case 'runtimeLeaseRecovery':
      return 'Lease recovery is not available in this environment.';
    case 'runtimeReplayProtection':
      return 'Replay protection is not available in this environment.';
    case 'runtimeHeartbeatMonitor':
      return 'Heartbeat monitoring is not available in this environment.';
    default:
      return 'This runtime feature is not available in this environment.';
  }
}

/** Test helper — reset boot cache. */
export function resetRuntimeCapabilitiesForTests() {
  cachedCapabilities = null;
  capabilityEvents.length = 0;
}

export function getRuntimeCapabilityEventsForTests() {
  return [...capabilityEvents];
}

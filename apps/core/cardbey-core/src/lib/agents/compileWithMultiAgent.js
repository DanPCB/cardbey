/**
 * Multi-agent intent → ArtifactBundle compiler.
 * Planning uses AgentCoordinator.decomposeGoal (execution deferred to topologyExecutor).
 */

import { randomUUID } from 'node:crypto';
import { AgentCoordinator } from '../orchestration/agentCoordinator.js';
import { getToolEntry, RISK } from '../intake/intakeToolRegistry.js';
import { ARTIFACT_COMPILER_VERSION } from '../artifact/types.ts';
import { validateArtifactBundle } from '../artifact/validateToolContracts.js';
import { isSlideshowGenerationProviderAvailable } from '../artifacts/slideshowArtifactContract.js';

/** Campaign specialist agent types → intake tool registry names. */
const CAMPAIGN_AGENT_TOOL_MAP = {
  brief: 'create_campaign_brief',
  graphics: 'generate_campaign_graphics',
  poster: 'generate_poster',
  slideshow: 'generate_slideshow',
  copy: 'generate_campaign_copy',
  qa: 'qa_campaign_package',
  package: 'package_campaign_artifact',
  research: 'market_research',
  build: 'create_promotion',
  action: 'launch_campaign',
  catalog: 'replace_store_catalog',
  media: 'generate_campaign_graphics',
};

const STATE_CHANGE_TOOLS = new Set([
  'launch_campaign',
  'create_campaign',
  'create_promotion',
  'package_campaign_artifact',
  'publish_social_post',
  'structured_store_build',
  'create_store',
]);

/**
 * @param {string} agentType
 * @param {string} missionType
 */
function resolveToolForAgent(agentType, missionType) {
  const key = String(agentType ?? '').trim().toLowerCase();
  if (missionType === 'launch_campaign' || missionType === 'create_campaign') {
    return CAMPAIGN_AGENT_TOOL_MAP[key] ?? 'create_campaign_brief';
  }
  return CAMPAIGN_AGENT_TOOL_MAP[key] ?? 'market_research';
}

/**
 * @param {import('../artifact/types.ts').CompileIntent} intent
 */
function resolveMissionType(intent) {
  if (typeof intent.missionType === 'string' && intent.missionType.trim()) {
    return intent.missionType.trim();
  }
  if (intent.tool === 'create_campaign') return 'launch_campaign';
  if (intent.tool === 'create_store') return 'create_store';
  return String(intent.tool ?? 'generic').trim() || 'generic';
}

/**
 * @param {Array<{ taskId?: string, agentType?: string, description?: string, dependsOn?: string[] }>} tasks
 * @param {string} missionType
 */
function tasksToTopology(tasks, missionType, metadata = {}) {
  const nodes = [];
  const edges = [];
  const nodeOrder = topologicalOrder(tasks);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskId = String(task.taskId ?? `step_${i + 1}`).trim();
    const agentType = String(task.agentType ?? 'research').trim();
    const toolName = resolveToolForAgent(agentType, missionType);
    const description =
      typeof task.description === 'string' && task.description.trim()
        ? task.description.trim()
        : `${agentType} step`;

    const dependsOn = Array.isArray(task.dependsOn)
      ? task.dependsOn.map((d) => String(d).trim()).filter(Boolean)
      : [];

    nodes.push({
      id: taskId,
      toolName,
      orderIndex: nodeOrder.get(taskId) ?? i,
      labels: { en: description },
      label: description,
      config: {
        agentType,
        dependsOn,
        missionType,
      },
      dependsOn,
    });

    for (const dep of dependsOn) {
      edges.push({ from: dep, to: taskId, type: 'depends_on' });
    }
  }

  return {
    id: randomUUID(),
    version: ARTIFACT_COMPILER_VERSION,
    missionType,
    nodes,
    edges,
    metadata: {
      ...metadata,
      nodeCount: nodes.length,
      agentCount: new Set(nodes.map((n) => n.config?.agentType)).size,
      compiledAt: new Date().toISOString(),
      compilerVersion: ARTIFACT_COMPILER_VERSION,
    },
  };
}

/**
 * @param {Array<{ taskId?: string, dependsOn?: string[] }>} tasks
 * @returns {Map<string, number>}
 */
function topologicalOrder(tasks) {
  const order = new Map();
  const ids = tasks.map((t, i) => String(t.taskId ?? `step_${i + 1}`).trim());
  const deps = new Map(
    tasks.map((t, i) => {
      const id = String(t.taskId ?? `step_${i + 1}`).trim();
      const list = Array.isArray(t.dependsOn) ? t.dependsOn.map((d) => String(d).trim()) : [];
      return [id, list];
    }),
  );

  const visited = new Set();
  let index = 0;

  /**
   * @param {string} id
   */
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const dep of deps.get(id) ?? []) {
      if (ids.includes(dep)) visit(dep);
    }
    order.set(id, index++);
  }

  for (const id of ids) visit(id);
  return order;
}

/**
 * @param {import('../artifact/types.ts').TopologyArtifact} topology
 * @param {string} intentText
 */
function buildPolicyArtifact(topology, intentText) {
  const gates = [];
  const risks = [];

  for (const node of topology.nodes) {
    if (STATE_CHANGE_TOOLS.has(node.toolName)) {
      gates.push({
        type: 'manual_approval',
        nodeId: node.id,
        tool: node.toolName,
        reason: `State-changing tool "${node.toolName}" requires approval before execution`,
        who: 'store_owner',
      });
    }

    const entry = getToolEntry(node.toolName);
    if (entry?.riskLevel === RISK.STATE_CHANGE) {
      risks.push({
        risk: `Step "${node.labels?.en ?? node.id}" modifies live store or campaign state`,
        mitigation: 'Review plan in TopologyReviewCard before approving',
        severity: 'medium',
        nodeId: node.id,
      });
    }
  }

  if (gates.length === 0 && topology.nodes.length > 0) {
    const last = topology.nodes[topology.nodes.length - 1];
    gates.push({
      type: 'confirmation_required',
      nodeId: last.id,
      tool: last.toolName,
      reason: 'Full execution plan requires confirmation before run',
      who: 'store_owner',
    });
  }

  return {
    id: randomUUID(),
    version: ARTIFACT_COMPILER_VERSION,
    gates,
    risks,
    defaults: {
      requiresConfirmation: true,
      autoRun: false,
      intentText,
    },
  };
}

/**
 * @param {import('../artifact/types.ts').TopologyArtifact} topology
 * @param {string} intentText
 * @param {Array<{ taskId?: string, agentType?: string, description?: string }>} tasks
 */
function buildReasoningArtifact(topology, intentText, tasks) {
  const phases = groupTasksIntoPhases(tasks);
  const chain = topology.nodes.map((node) => ({
    step: node.id,
    agentType: String(node.config?.agentType ?? ''),
    toolName: node.toolName,
    rationale: node.labels?.en ?? node.label,
  }));

  const criticalPath = topology.nodes
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((n) => n.id);

  const parallelWork = topology.edges.length
    ? topology.nodes.filter((n) => !n.dependsOn?.length).map((n) => n.id)
    : [];

  const estimatedMinutes = Math.max(5, topology.nodes.length * 4);

  return {
    id: randomUUID(),
    version: ARTIFACT_COMPILER_VERSION,
    summary: `Compiled ${topology.nodes.length}-step plan for: ${intentText.slice(0, 200)}`,
    chain,
    phases,
    keyDecisions: topology.nodes.map((node) => ({
      decision: node.labels?.en ?? node.label ?? node.id,
      reason: `Mapped ${node.config?.agentType ?? 'agent'} → ${node.toolName}`,
    })),
    tradeoffs: [
      {
        what: 'Parallel specialist agents vs sequential checkpoints',
        why: 'Campaign deliverables (brief, creative, copy) can run in parallel after brief completes',
      },
    ],
    timeline: {
      estimatedMinutes,
      criticalPath,
      parallelWork,
    },
    risks: [],
    approvalGates: topology.nodes
      .filter((n) => STATE_CHANGE_TOOLS.has(n.toolName))
      .map((n) => ({
        step: n.id,
        what: n.labels?.en ?? n.toolName,
        who: 'store_owner',
      })),
    nextSteps: ['Review execution plan', 'Approve or reject in TopologyReviewCard'],
    metadata: {
      nodeCount: topology.nodes.length,
      agentCount: new Set(topology.nodes.map((n) => n.config?.agentType)).size,
      refinementIterations: 0,
      qualityScore: Math.min(95, 70 + topology.nodes.length * 3),
    },
  };
}

/**
 * @param {Array<{ taskId?: string, agentType?: string, description?: string, dependsOn?: string[] }>} tasks
 */
function groupTasksIntoPhases(tasks) {
  const phases = [];
  const waveByTask = new Map();
  let wave = 0;

  const ids = tasks.map((t, i) => String(t.taskId ?? `step_${i + 1}`).trim());

  while (waveByTask.size < tasks.length && wave < tasks.length + 2) {
    const waveTasks = [];
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const id = ids[i];
      if (waveByTask.has(id)) continue;
      const deps = Array.isArray(task.dependsOn) ? task.dependsOn.map((d) => String(d).trim()) : [];
      if (deps.every((d) => waveByTask.has(d))) {
        waveTasks.push({ id, task });
        waveByTask.set(id, wave);
      }
    }
    if (waveTasks.length === 0) break;
    phases.push({
      name: `Phase ${wave + 1}`,
      description: waveTasks.map(({ task }) => task.description ?? task.agentType).join('; '),
      duration: `~${waveTasks.length * 4} min`,
      steps: waveTasks.length,
      nodeIds: waveTasks.map(({ id }) => id),
    });
    wave += 1;
  }

  return phases;
}

/**
 * @param {import('../artifact/types.ts').TopologyArtifact} topology
 */
function buildToolContracts(topology) {
  return topology.nodes.map((node) => {
    const entry = getToolEntry(node.toolName);
    return {
      toolName: node.toolName,
      nodeId: node.id,
      requiredParams: entry?.requiredParams ? [...entry.requiredParams] : [],
      optionalParams: entry?.optionalParams ? [...entry.optionalParams] : [],
    };
  });
}

/**
 * Plan-only coordinator call — does not execute agents (HITL runs after approval).
 *
 * @param {string} goal
 * @param {import('../artifact/types.ts').CompileContext} context
 * @param {string} missionType
 */
async function planWithAgentCoordinator(goal, context, missionType) {
  const orchestrationKind =
    context.orchestrationKind ??
    (missionType === 'launch_campaign' || missionType === 'create_campaign'
      ? 'campaign_orchestration'
      : 'default');

  const coordinator = new AgentCoordinator({
    missionId: context.missionId,
    tenantKey: context.tenantKey ?? 'default',
    locale: context.locale ?? 'en',
    orchestrationKind,
    baseContext: {
      missionId: context.missionId,
      storeId: context.storeId ?? undefined,
      userId: context.userId ?? undefined,
      sessionId: context.sessionId ?? undefined,
    },
  });

  const missionContext = {
    storeId: context.storeId,
    sessionId: context.sessionId,
    intentTool: missionType,
  };

  let tasks = await coordinator.decomposeGoal(goal, missionContext);
  if (!Array.isArray(tasks) || tasks.length === 0) {
    tasks = defaultCampaignTasks(goal);
  }
  return tasks.slice(0, coordinator.maxAgents);
}

/**
 * @param {string} goal
 */
function defaultCampaignTasks(goal) {
  const g = goal.trim() || 'Campaign';
  return [
    { taskId: 'brief_1', agentType: 'brief', description: `Campaign brief: ${g}`, dependsOn: [] },
    {
      taskId: 'graphics_1',
      agentType: 'graphics',
      description: 'Generate promotional graphics',
      dependsOn: ['brief_1'],
    },
    {
      taskId: 'copy_1',
      agentType: 'copy',
      description: 'Write campaign copy',
      dependsOn: ['brief_1'],
    },
    {
      taskId: 'qa_1',
      agentType: 'qa',
      description: 'QA campaign deliverables',
      dependsOn: ['graphics_1', 'copy_1'],
    },
    {
      taskId: 'package_1',
      agentType: 'package',
      description: 'Assemble campaign package',
      dependsOn: ['qa_1'],
    },
  ];
}

/**
 * When a store is connected, add a branded poster step (generate_poster) before packaging.
 *
 * @param {Array<{ taskId?: string, agentType?: string, description?: string, dependsOn?: string[] }>} tasks
 * @param {string | null | undefined} storeId
 * @param {string} missionType
 */
function injectPosterTaskForStore(tasks, storeId, missionType) {
  if (!storeId?.trim()) return tasks;
  if (missionType !== 'launch_campaign' && missionType !== 'create_campaign') return tasks;

  const augmented = tasks.map((task) => ({
    ...task,
    dependsOn: Array.isArray(task.dependsOn) ? [...task.dependsOn] : [],
  }));

  if (augmented.some((task) => resolveToolForAgent(task.agentType, missionType) === 'generate_poster')) {
    return augmented;
  }

  const briefTask = augmented.find(
    (task) => resolveToolForAgent(task.agentType, missionType) === 'create_campaign_brief',
  );
  const copyTask = augmented.find(
    (task) => resolveToolForAgent(task.agentType, missionType) === 'generate_campaign_copy',
  );
  const briefId = String(briefTask?.taskId ?? 'brief_1').trim();
  const copyId = String(copyTask?.taskId ?? 'copy_1').trim();

  const posterTask = {
    taskId: 'poster_1',
    agentType: 'poster',
    description: 'Generate branded campaign poster',
    dependsOn: [briefId, copyId],
  };

  const packageIdx = augmented.findIndex(
    (task) => resolveToolForAgent(task.agentType, missionType) === 'package_campaign_artifact',
  );
  if (packageIdx >= 0) {
    augmented.splice(packageIdx, 0, posterTask);
  } else {
    augmented.push(posterTask);
  }

  return augmented;
}

/**
 * Add slideshow generation when a provider is configured (mock or server).
 *
 * @param {Array<{ taskId?: string, agentType?: string, description?: string, dependsOn?: string[] }>} tasks
 * @param {string} missionType
 */
function injectSlideshowTaskForCampaign(tasks, missionType) {
  if (missionType !== 'launch_campaign' && missionType !== 'create_campaign') return tasks;
  if (!isSlideshowGenerationProviderAvailable()) return tasks;

  const augmented = tasks.map((task) => ({
    ...task,
    dependsOn: Array.isArray(task.dependsOn) ? [...task.dependsOn] : [],
  }));

  if (augmented.some((task) => resolveToolForAgent(task.agentType, missionType) === 'generate_slideshow')) {
    return augmented;
  }

  const briefTask = augmented.find(
    (task) => resolveToolForAgent(task.agentType, missionType) === 'create_campaign_brief',
  );
  const graphicsTask = augmented.find(
    (task) => resolveToolForAgent(task.agentType, missionType) === 'generate_campaign_graphics',
  );
  const briefId = String(briefTask?.taskId ?? 'brief_1').trim();
  const graphicsId = String(graphicsTask?.taskId ?? 'graphics_1').trim();

  const slideshowTask = {
    taskId: 'slideshow_1',
    agentType: 'slideshow',
    description: 'Generate campaign slideshow',
    dependsOn: [briefId, graphicsId],
  };

  const packageIdx = augmented.findIndex(
    (task) => resolveToolForAgent(task.agentType, missionType) === 'package_campaign_artifact',
  );
  if (packageIdx >= 0) {
    augmented.splice(packageIdx, 0, slideshowTask);
  } else {
    augmented.push(slideshowTask);
  }

  return augmented;
}

/**
 * Compile user intent into a validated ArtifactBundle.
 *
 * @param {import('../artifact/types.ts').CompileIntent} intent
 * @param {import('../artifact/types.ts').CompileContext} context
 * @returns {Promise<import('../artifact/types.ts').CompileWithMultiAgentResult>}
 */
export async function compileWithMultiAgent(intent, context) {
  if (!intent?.text?.trim()) {
    throw new Error('compileWithMultiAgent requires intent.text');
  }
  if (!context?.missionId?.trim()) {
    throw new Error('compileWithMultiAgent requires context.missionId');
  }

  const missionType = resolveMissionType(intent);
  const goal = intent.text.trim();
  const storeId = intent.storeId ?? context.storeId ?? null;

  let tasks = await planWithAgentCoordinator(goal, context, missionType);
  tasks = injectPosterTaskForStore(tasks, storeId, missionType);
  tasks = injectSlideshowTaskForCampaign(tasks, missionType);

  const topology = tasksToTopology(tasks, missionType, {
    intent: goal,
    storeId,
    sessionId: context.sessionId ?? null,
    orchestrationKind:
      context.orchestrationKind ??
      (missionType.includes('campaign') ? 'campaign_orchestration' : 'default'),
  });

  const policy = buildPolicyArtifact(topology, goal);
  const reasoning = buildReasoningArtifact(topology, goal, tasks);
  const toolContracts = buildToolContracts(topology);

  const artifactBundle = {
    topology,
    policy,
    reasoning,
    toolContracts,
  };

  const validation = validateArtifactBundle(artifactBundle);
  if (!validation.ok) {
    const err = new Error(`ArtifactBundle validation failed: ${(validation.errors ?? []).join('; ')}`);
    err.validation = validation;
    err.artifactBundle = artifactBundle;
    throw err;
  }

  return {
    missionId: context.missionId,
    artifactBundle,
    validation,
  };
}

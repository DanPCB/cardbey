/**
 * COMPONENT REGISTRY — Single source of truth (39 components).
 * docStatus: running | partial | placeholder
 */

/** @typedef {'frontend'|'intake'|'planning'|'execution'|'memory'|'learning'|'tools'|'data'|'integration'} ObservationLayer */
/** @typedef {'running'|'partial'|'placeholder'} RegistryDocStatus */

/**
 * @typedef {Object} ComponentRegistryEntry
 * @property {string} id
 * @property {string} name
 * @property {ObservationLayer} layer
 * @property {RegistryDocStatus} docStatus
 * @property {string} description
 * @property {string[]} dependencies
 * @property {string[]} envFlags
 * @property {string} [healthCheck]
 * @property {Record<string, unknown>} [healthCheckConfig]
 */

/** @type {ComponentRegistryEntry[]} */
export const COMPONENT_REGISTRY = [
  // FRONTEND (9)
  {
    id: 'performer_console',
    name: 'Performer Console',
    layer: 'frontend',
    docStatus: 'running',
    description: 'Chat, missions, checkpoints, draft preview',
    dependencies: ['intake_v2', 'runtime_kernel'],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'control_center',
    name: 'Control Center',
    layer: 'frontend',
    docStatus: 'running',
    description: 'Admin dashboard, health metrics, alerts',
    dependencies: [],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'bi_governance',
    name: 'BI Governance',
    layer: 'frontend',
    docStatus: 'running',
    description: 'Governed business inspection and activation workflows',
    dependencies: ['control_center'],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'pil',
    name: 'PIL Assistant',
    layer: 'frontend',
    docStatus: 'running',
    description: 'Observe → Confirm → Performer handoff (autoSubmit: false)',
    dependencies: ['intake_v2'],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'storefront',
    name: 'Storefront',
    layer: 'frontend',
    docStatus: 'running',
    description: 'Canonical renderer, commerce shell, public store pages',
    dependencies: [],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'ask_cardbey',
    name: 'Ask Cardbey',
    layer: 'frontend',
    docStatus: 'running',
    description: 'RAG Q&A panel, hidden on Performer first surfaces',
    dependencies: ['rag_store'],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'layout_studio',
    name: 'Layout Studio',
    layer: 'frontend',
    docStatus: 'running',
    description: 'Auto-layout tool via POST /api/layout/apply',
    dependencies: [],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'control_tower',
    name: 'Control Tower',
    layer: 'frontend',
    docStatus: 'partial',
    description: 'Overview API wired; other tabs use mock data',
    dependencies: ['runtime_kernel'],
    envFlags: [],
    healthCheck: 'frontend_heartbeat',
  },
  {
    id: 'console_sidebar_stubs',
    name: 'Console Sidebar Stubs',
    layer: 'frontend',
    docStatus: 'placeholder',
    description: 'Placeholder sections in console navigation',
    dependencies: [],
    envFlags: [],
    healthCheck: 'placeholder',
  },

  // INTAKE (6)
  {
    id: 'intake_v2',
    name: 'Intake V2',
    layer: 'intake',
    docStatus: 'running',
    description: 'Primary NL entry: shortcut → reasoner → planner → runtime',
    dependencies: ['context_engine', 'intent_reasoner'],
    envFlags: [],
    healthCheck: 'always_running',
  },
  {
    id: 'intake_v1',
    name: 'Intake V1',
    layer: 'intake',
    docStatus: 'partial',
    description: 'Deprecated shim forwarding to V2',
    dependencies: ['intake_v2'],
    envFlags: [],
    healthCheck: 'deprecated',
  },
  {
    id: 'llm_reasoner',
    name: 'LLMReasoner',
    layer: 'intake',
    docStatus: 'partial',
    description: 'LLM-first intent detection (flag-gated off by default)',
    dependencies: ['intake_v2'],
    envFlags: ['ENABLE_LLM_REASONER'],
    healthCheck: 'flag_gated',
  },
  {
    id: 'intent_reasoner',
    name: 'IntentReasoner',
    layer: 'intake',
    docStatus: 'running',
    description: 'Phase B.2 deterministic classification + learning hooks',
    dependencies: ['context_engine'],
    envFlags: [],
    healthCheck: 'always_running',
  },
  {
    id: 'react_planner',
    name: 'ReactPlanner',
    layer: 'intake',
    docStatus: 'running',
    description: 'Post-classify decision layer (default on)',
    dependencies: ['intent_reasoner'],
    envFlags: [],
    healthCheck: 'always_running',
  },
  {
    id: 'capability_proposal',
    name: 'Capability Proposal',
    layer: 'intake',
    docStatus: 'partial',
    description: 'Self-building capability proposal for missing tools',
    dependencies: ['intake_v2'],
    envFlags: ['ENABLE_SELF_BUILDING'],
    healthCheck: 'flag_gated',
  },

  // PLANNING (2)
  {
    id: 'dynamic_planner',
    name: 'Dynamic Planner',
    layer: 'planning',
    docStatus: 'partial',
    description: 'Phase C dynamic plan generation (flag-gated off by default)',
    dependencies: ['intent_reasoner'],
    envFlags: ['ENABLE_DYNAMIC_PLANNER'],
    healthCheck: 'flag_gated',
  },
  {
    id: 'legacy_orchestrator',
    name: 'Legacy Orchestrator',
    layer: 'planning',
    docStatus: 'partial',
    description: 'Creative/SAM3 path parallel to runtime (flag-gated)',
    dependencies: [],
    envFlags: ['ENABLE_LEGACY_ORCHESTRATOR'],
    healthCheck: 'flag_gated',
  },

  // EXECUTION (5)
  {
    id: 'runtime_kernel',
    name: 'Runtime Kernel',
    layer: 'execution',
    docStatus: 'running',
    description: 'Core execution engine (EXECUTION_MODE: kernel)',
    dependencies: ['tool_dispatcher'],
    envFlags: [],
    healthCheck: 'runtime_kernel',
  },
  {
    id: 'mission_orchestrator',
    name: 'Mission Orchestrator',
    layer: 'execution',
    docStatus: 'partial',
    description: 'Mission sequencing (flag-gated off by default)',
    dependencies: ['runtime_kernel'],
    envFlags: ['ENABLE_RUNTIME_MISSION_ORCHESTRATOR'],
    healthCheck: 'flag_gated',
  },
  {
    id: 'tool_dispatcher',
    name: 'Tool Dispatcher',
    layer: 'execution',
    docStatus: 'running',
    description: 'Registered tools in registry',
    dependencies: ['runtime_kernel'],
    envFlags: [],
    healthCheck: 'tool_registry',
  },
  {
    id: 'performer_runtime',
    name: 'Performer Runtime',
    layer: 'execution',
    docStatus: 'running',
    description: 'Unified mission execution pipeline facade',
    dependencies: ['runtime_kernel'],
    envFlags: [],
    healthCheck: 'runtime_diagnostics',
  },
  {
    id: 'safe_execution_governance',
    name: 'Safe Execution Governance',
    layer: 'execution',
    docStatus: 'running',
    description: 'High-impact actions require user confirmation',
    dependencies: ['runtime_kernel'],
    envFlags: [],
    healthCheck: 'always_running',
  },

  // MEMORY (4)
  {
    id: 'context_engine',
    name: 'Context Engine',
    layer: 'memory',
    docStatus: 'running',
    description: 'Persisted session context (Phase A)',
    dependencies: [],
    envFlags: ['DISABLE_CONTEXT_ENGINE'],
    healthCheck: 'context_engine',
  },
  {
    id: 'episodic_memory',
    name: 'Episodic Memory',
    layer: 'memory',
    docStatus: 'running',
    description: 'Append-only blackboard events',
    dependencies: ['context_engine'],
    envFlags: [],
    healthCheck: 'episodic_memory',
  },
  {
    id: 'memory_facade',
    name: 'Memory Facade',
    layer: 'memory',
    docStatus: 'running',
    description: 'Unified baseline + user + suitcase + PIL',
    dependencies: ['context_engine'],
    envFlags: [],
    healthCheck: 'memory_facade',
  },
  {
    id: 'semantic_memory',
    name: 'Semantic Memory',
    layer: 'memory',
    docStatus: 'partial',
    description: 'Distributed; no single module (intent graph fragmented)',
    dependencies: ['context_engine'],
    envFlags: [],
    healthCheck: 'distributed',
  },

  // LEARNING (4)
  {
    id: 'feedback_capture',
    name: 'Feedback Capture',
    layer: 'learning',
    docStatus: 'running',
    description: 'Thumbs up/down, corrections, implicit feedback',
    dependencies: [],
    envFlags: ['DISABLE_LEARNING_LAYER'],
    healthCheck: 'learning',
  },
  {
    id: 'behavior_analysis',
    name: 'Behavior Analysis',
    layer: 'learning',
    docStatus: 'running',
    description: 'Pattern detection, profile updates',
    dependencies: ['feedback_capture'],
    envFlags: ['DISABLE_LEARNING_LAYER'],
    healthCheck: 'learning',
  },
  {
    id: 'confidence_calibration',
    name: 'Confidence Calibration',
    layer: 'learning',
    docStatus: 'running',
    description: 'Confidence adjustment based on feedback',
    dependencies: ['behavior_analysis'],
    envFlags: ['DISABLE_LEARNING_LAYER'],
    healthCheck: 'learning',
  },
  {
    id: 'personalization',
    name: 'Personalization',
    layer: 'learning',
    docStatus: 'running',
    description: 'User preferences, frequently used tools',
    dependencies: ['confidence_calibration'],
    envFlags: ['DISABLE_LEARNING_LAYER'],
    healthCheck: 'learning',
  },

  // TOOLS (5)
  {
    id: 'store_tools',
    name: 'Store Tools',
    layer: 'tools',
    docStatus: 'running',
    description: 'Registered store tools',
    dependencies: ['tool_dispatcher'],
    envFlags: [],
    healthCheck: 'tool_count',
    healthCheckConfig: { category: 'store' },
  },
  {
    id: 'campaign_tools',
    name: 'Campaign Tools',
    layer: 'tools',
    docStatus: 'running',
    description: 'Registered campaign tools',
    dependencies: ['tool_dispatcher'],
    envFlags: [],
    healthCheck: 'tool_count',
    healthCheckConfig: { category: 'promotion' },
  },
  {
    id: 'product_tools',
    name: 'Product Tools',
    layer: 'tools',
    docStatus: 'running',
    description: 'Catalog/product tools',
    dependencies: ['tool_dispatcher'],
    envFlags: [],
    healthCheck: 'product_tools',
  },
  {
    id: 'graphic_tools',
    name: 'Graphic Tools',
    layer: 'tools',
    docStatus: 'running',
    description: 'Content and visual generation tools',
    dependencies: ['tool_dispatcher'],
    envFlags: [],
    healthCheck: 'tool_count',
    healthCheckConfig: { category: 'content' },
  },
  {
    id: 'skills_api',
    name: 'Skills API',
    layer: 'tools',
    docStatus: 'partial',
    description: 'Skill runtime enabled (flag-gated)',
    dependencies: ['tool_dispatcher'],
    envFlags: ['ENABLE_RUNTIME_SKILL_RUNTIME'],
    healthCheck: 'flag_gated',
  },

  // DATA (3)
  {
    id: 'database',
    name: 'Database',
    layer: 'data',
    docStatus: 'running',
    description: 'SQLite/Postgres via Prisma',
    dependencies: [],
    envFlags: [],
    healthCheck: 'database',
  },
  {
    id: 'memory_store',
    name: 'Memory Store',
    layer: 'data',
    docStatus: 'running',
    description: 'Context, learning, and blackboard persistence',
    dependencies: [],
    envFlags: [],
    healthCheck: 'memory_store',
  },
  {
    id: 'rag_store',
    name: 'RAG Store',
    layer: 'data',
    docStatus: 'partial',
    description: 'Embedding schema exists; usage is partial',
    dependencies: ['database'],
    envFlags: ['ENABLE_RAG_IN_REASONER'],
    healthCheck: 'rag_store',
  },

  // INTEGRATION (3)
  {
    id: 'http_api_proxy',
    name: 'HTTP API Proxy',
    layer: 'integration',
    docStatus: 'running',
    description: 'Vite proxy and API client to cardbey-core',
    dependencies: [],
    envFlags: [],
    healthCheck: 'always_running',
  },
  {
    id: 'sse_streams',
    name: 'SSE Streams',
    layer: 'integration',
    docStatus: 'running',
    description: 'Server-sent events for real-time updates',
    dependencies: [],
    envFlags: [],
    healthCheck: 'sse',
  },
  {
    id: 'performer_handoff',
    name: 'Performer Handoff',
    layer: 'integration',
    docStatus: 'running',
    description: 'Control Center → PIL → Discovery → Performer with context',
    dependencies: ['intake_v2'],
    envFlags: [],
    healthCheck: 'always_running',
  },
];

/** @param {RegistryDocStatus} docStatus */
export function docStatusToLiveStatus(docStatus) {
  if (docStatus === 'running') return 'running';
  if (docStatus === 'partial') return 'degraded';
  return 'down';
}

export function computeRegistryBaseline(registry = COMPONENT_REGISTRY) {
  const running = registry.filter((c) => c.docStatus === 'running').length;
  const partial = registry.filter((c) => c.docStatus === 'partial').length;
  const placeholder = registry.filter((c) => c.docStatus === 'placeholder').length;
  const total = registry.length;
  const successRatePct = total > 0 ? Math.round((running / total) * 1000) / 10 : 0;
  return { running, partial, placeholder, total, successRatePct };
}

export function getComponentRegistry() {
  return COMPONENT_REGISTRY;
}

export function getRegistryComponent(id) {
  return COMPONENT_REGISTRY.find((c) => c.id === id) ?? null;
}

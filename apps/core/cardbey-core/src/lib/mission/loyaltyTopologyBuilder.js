/**
 * Deterministic loyalty program topology — cognitive stages, not LLM vague steps.
 */


/**
 * @typedef {'perception' | 'understanding' | 'planning' | 'execution' | 'verification'} LoyaltyStage
 *
 * @typedef {{
 *   id: string;
 *   stage: LoyaltyStage;
 *   title: string;
 *   tool: string;
 *   toolName: string;
 *   orderIndex: number;
 *   dependsOn: string[];
 *   inputFrom?: string[];
 *   requiredInputs?: string[];
 *   produces?: string[];
 *   retryable: boolean;
 *   labels: { en: string };
 *   config?: Record<string, unknown>;
 * }} LoyaltyTopologyNode
 */


/**
 * @param {{
 *   text?: string;
 *   storeId?: string | null;
 *   attachmentAnalysis?: Record<string, unknown> | null;
 *   preseededDraft?: Record<string, unknown> | null;
 *   traceId?: string | null;
 * }} [opts]
 * @returns {{
 *   topology: { id: string; version: string; missionType: string; nodes: LoyaltyTopologyNode[]; edges: Array<{ from: string; to: string }> };
 *   nodes: LoyaltyTopologyNode[];
 *   policy: { id: string; version: string; gates: unknown[] };
 *   reasoning: Record<string, unknown>;
 * }}
 */

export function buildLoyaltyProgramTopology(opts = {}) {
  const text = String(opts.text ?? '').trim() || 'create a loyalty program';
  const storeId = typeof opts.storeId === 'string' && opts.storeId.trim() ? opts.storeId.trim() : null;
  const attachmentAnalysis =
    opts.attachmentAnalysis && typeof opts.attachmentAnalysis === 'object' ? opts.attachmentAnalysis : null;
  const preseededDraft =
    opts.preseededDraft && typeof opts.preseededDraft === 'object' ? opts.preseededDraft : null;
  const traceId = opts.traceId ?? null;

  /** @type {LoyaltyTopologyNode[]} */
  const nodes = [
    {
      id: 'loyalty_load_store',
      stage: 'perception',
      title: 'Load store context',
      tool: 'loyalty.load_store_context',
      toolName: 'loyalty.load_store_context',
      orderIndex: 0,
      dependsOn: [],
      inputFrom: [],
      requiredInputs: ['storeId'],
      produces: ['storeContext'],
      retryable: true,
      labels: { en: 'Load store context' },
      config: { stage: 'perception', produces: ['storeContext'] },
    },
    {
      id: 'loyalty_analyze_card',
      stage: 'perception',
      title: 'Analyze uploaded loyalty card',
      tool: 'loyalty.analyze_attachment',
      toolName: 'loyalty.analyze_attachment',
      orderIndex: 1,
      dependsOn: [],
      inputFrom: [],
      requiredInputs: [],
      produces: ['attachmentAnalysis', 'visualLoyaltyHints'],
      retryable: true,
      labels: { en: 'Analyze uploaded loyalty card' },
      config: { stage: 'perception', produces: ['attachmentAnalysis', 'visualLoyaltyHints'] },
    },
    {
      id: 'loyalty_infer_requirements',
      stage: 'understanding',
      title: 'Infer loyalty requirements',
      tool: 'loyalty.infer_requirements',
      toolName: 'loyalty.infer_requirements',
      orderIndex: 2,
      dependsOn: ['loyalty_load_store', 'loyalty_analyze_card'],
      inputFrom: ['loyalty_load_store', 'loyalty_analyze_card'],
      requiredInputs: ['storeContext'],
      produces: ['loyaltyRequirements', 'missingFields'],
      retryable: true,
      labels: { en: 'Infer loyalty requirements' },
      config: { stage: 'understanding', produces: ['loyaltyRequirements', 'missingFields'] },
    },
    {
      id: 'loyalty_generate_draft',
      stage: 'planning',
      title: 'Generate loyalty draft',
      tool: 'loyalty.generate_draft',
      toolName: 'loyalty.generate_draft',
      orderIndex: 3,
      dependsOn: ['loyalty_infer_requirements'],
      inputFrom: ['loyalty_infer_requirements', 'loyalty_load_store', 'loyalty_analyze_card'],
      requiredInputs: ['loyaltyRequirements'],
      produces: ['loyaltyDraft'],
      retryable: true,
      labels: { en: 'Generate loyalty draft' },
      config: { stage: 'planning', produces: ['loyaltyDraft'] },
    },
    {
      id: 'loyalty_validate_draft',
      stage: 'verification',
      title: 'Validate loyalty draft',
      tool: 'loyalty.validate_draft',
      toolName: 'loyalty.validate_draft',
      orderIndex: 4,
      dependsOn: ['loyalty_generate_draft'],
      inputFrom: ['loyalty_generate_draft'],
      requiredInputs: ['loyaltyDraft'],
      produces: ['validationResult'],
      retryable: true,
      labels: { en: 'Validate loyalty draft' },
      config: { stage: 'verification', produces: ['validationResult'] },
    },
    {
      id: 'loyalty_persist_draft',
      stage: 'execution',
      title: 'Persist loyalty draft',
      tool: 'loyalty.persist_draft',
      toolName: 'loyalty.persist_draft',
      orderIndex: 5,
      dependsOn: ['loyalty_validate_draft'],
      inputFrom: ['loyalty_validate_draft', 'loyalty_generate_draft'],
      requiredInputs: ['loyaltyDraft', 'storeId'],
      produces: ['loyaltyProgramDraft'],
      retryable: true,
      labels: { en: 'Persist loyalty draft' },
      config: { stage: 'execution', produces: ['loyaltyProgramDraft'] },
    },
    {
      id: 'loyalty_present_review',
      stage: 'verification',
      title: 'Present owner review',
      tool: 'loyalty.present_review',
      toolName: 'loyalty.present_review',
      orderIndex: 6,
      dependsOn: ['loyalty_persist_draft'],
      inputFrom: ['loyalty_persist_draft'],
      requiredInputs: ['loyaltyProgramDraft'],
      produces: ['ownerReviewArtifact'],
      retryable: false,
      labels: { en: 'Present owner review' },
      config: { stage: 'verification', produces: ['ownerReviewArtifact'] },
    },
  ];

  const edges = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      edges.push({ from: dep, to: node.id });
    }
  }

  const topology = {
    id: `loyalty_topology_${Date.now().toString(36)}`,
    version: '1',
    missionType: 'setup_loyalty_program',
    nodes,
    edges,
    completionCriteria: {
      requiredArtifacts: [{ type: 'generated_loyalty_program', mandatory: true }],
      requiredPersistedRecords: [{ type: 'loyalty_program_draft', mandatory: true }],
    },
  };

  const reasoning = {
    id: `loyalty_reasoning_${Date.now().toString(36)}`,
    version: '1',
    summary: `Deterministic loyalty program plan for: ${text.slice(0, 120)}`,
    phases: [
      {
        name: 'Perception',
        description: 'Load store context and analyze uploaded loyalty card',
        steps: 2,
      },
      {
        name: 'Understanding',
        description: 'Infer requirements and identify missing owner fields',
        steps: 1,
      },
      {
        name: 'Planning',
        description: 'Generate loyalty draft from requirements',
        steps: 1,
      },
      {
        name: 'Verification & execution',
        description: 'Validate, persist draft, and present owner review',
        steps: 3,
      },
    ],
    keyDecisions: nodes.map((n) => ({
      decision: n.title,
      reason: `${n.stage} · ${n.toolName}`,
    })),
    timeline: { estimatedMinutes: 8, criticalPath: nodes.map((n) => n.id) },
    metadata: {
      nodeCount: nodes.length,
      agentCount: 0,
      refinementIterations: 0,
      qualityScore: 90,
      builder: 'loyaltyTopologyBuilder',
      cognitiveStages: ['perception', 'understanding', 'planning', 'execution', 'verification'],
    },
  };

  const policy = {
    id: `loyalty_policy_${Date.now().toString(36)}`,
    version: '1',
    gates: [
      {
        type: 'manual_approval',
        nodeId: 'loyalty_present_review',
        reason: 'Owner reviews loyalty draft before apply',
      },
    ],
    risks: [],
  };

  return {
    topology,
    nodes,
    policy,
    reasoning,
    metadata: {
      storeId,
      attachmentAnalysis,
      preseededDraft,
      traceId,
      builder: 'loyaltyTopologyBuilder',
      pathId: 'loyalty_typed_topology',
    },
  };
}


/**
 * Convert builder output into ArtifactBundle shape expected by validateArtifactBundle / writePending.
 * @param {ReturnType<typeof buildLoyaltyProgramTopology>} built
 * @param {Record<string, unknown>} [extra]
 */

export function loyaltyBuilderToArtifactBundle(built, extra = {}) {
  return {
    topology: built.topology,
    policy: built.policy,
    reasoning: built.reasoning,
    toolContracts: [],
    metadata: {
      ...(built.metadata && typeof built.metadata === 'object' ? built.metadata : {}),
      ...extra,
      source: 'loyaltyTopologyBuilder',
    },
  };
}


export default buildLoyaltyProgramTopology;


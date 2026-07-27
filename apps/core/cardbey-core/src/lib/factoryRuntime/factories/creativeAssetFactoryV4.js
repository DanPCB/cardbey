/**
 * creative_asset_factory_v4 — multi-scene render + optional burn-in + governed publish.
 */

/** @type {import('../factoryDefinition.js').FactoryDefinitionSchema extends import('zod').ZodType<infer T> ? T : never} */
export const creativeAssetFactoryV4 = {
  factoryId: 'creative_asset_factory_v4',
  version: '4.0.0',
  name: 'Creative Asset Factory V4',
  description:
    'Research → script → assets → scene binding → plan → approve → multi-scene render → subtitle burn → music → final review → governed publish → artifact.',
  inputSchema: {
    intent: { type: 'string', required: true },
    assetKind: { type: 'string', enum: ['video', 'slideshow'], default: 'video' },
    storeId: { type: 'string', optional: true },
    userMessage: { type: 'string', optional: true },
  },
  approvalPolicy: {
    mode: 'per_stage',
    defaultStatus: 'awaiting_factory_approval',
    approvalStageId: 'plan_approval',
    planOutputPath: 'stageOutputs.video_plan.videoPlan',
    mergeStrategy: 'replace_plan',
    finalApprovalStageId: 'final_asset_review',
  },
  artifactPolicy: {
    artifactType: 'final_creative_asset',
    artifactTypeResolver: 'policy',
    finalizeStageId: 'artifact_finalize',
    sourceStageIds: ['publish_handoff', 'multi_scene_render'],
    requiredFields: [],
    persist: true,
  },
  stages: [
    { stageId: 'research', agentRole: 'researcher', builtinStage: true, timeoutMs: 120_000 },
    { stageId: 'script', agentRole: 'writer', builtinStage: true, timeoutMs: 90_000 },
    { stageId: 'asset_search', agentRole: 'curator', builtinStage: true, timeoutMs: 90_000 },
    { stageId: 'scene_binding', agentRole: 'director', builtinStage: true, timeoutMs: 60_000 },
    { stageId: 'video_plan', agentRole: 'planner', builtinStage: true, timeoutMs: 60_000 },
    {
      stageId: 'plan_approval',
      agentRole: 'human',
      requiresApproval: true,
      approvalKind: 'plan',
      requiredArtifacts: ['videoPlan'],
    },
    {
      stageId: 'multi_scene_render',
      agentRole: 'renderer',
      builtinStage: true,
      timeoutMs: 600_000,
    },
    {
      stageId: 'subtitle_burn_optional',
      agentRole: 'captioner',
      builtinStage: true,
      timeoutMs: 120_000,
    },
    {
      stageId: 'music_selection',
      agentRole: 'curator',
      builtinStage: true,
      timeoutMs: 120_000,
    },
    {
      stageId: 'final_asset_review',
      agentRole: 'human',
      requiresApproval: true,
      approvalKind: 'final_asset',
      requiredArtifacts: ['subtitleArtifact'],
    },
    {
      stageId: 'publish_handoff',
      agentRole: 'handoff',
      builtinStage: true,
      timeoutMs: 30_000,
    },
    { stageId: 'artifact_finalize', agentRole: 'finalizer', timeoutMs: 30_000 },
  ],
};

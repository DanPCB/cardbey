/**
 * creative_asset_factory_v3 — V2 pipeline + subtitles + music + final review + publish handoff.
 */

/** @type {import('../factoryDefinition.js').FactoryDefinitionSchema extends import('zod').ZodType<infer T> ? T : never} */
export const creativeAssetFactoryV3 = {
  factoryId: 'creative_asset_factory_v3',
  version: '3.0.0',
  name: 'Creative Asset Factory V3',
  description:
    'Research → script → assets → plan → approve → execute → subtitles → music → final review → publish handoff → artifact.',
  inputSchema: {
    intent: { type: 'string', required: true },
    assetKind: { type: 'string', enum: ['video', 'slideshow'], default: 'video' },
    storeId: { type: 'string', optional: true },
    userMessage: { type: 'string', optional: true },
  },
  approvalPolicy: {
    mode: 'per_stage',
    defaultStatus: 'awaiting_factory_approval',
    approvalStageId: 'approval',
    planOutputPath: 'stageOutputs.video_plan.videoPlan',
    mergeStrategy: 'replace_plan',
    finalApprovalStageId: 'final_asset_review',
  },
  artifactPolicy: {
    artifactType: 'final_creative_asset',
    artifactTypeResolver: 'policy',
    finalizeStageId: 'artifact_finalize',
    sourceStageIds: ['publish_handoff', 'execute'],
    requiredFields: [],
    persist: true,
  },
  stages: [
    { stageId: 'research', agentRole: 'researcher', builtinStage: true, timeoutMs: 120_000 },
    { stageId: 'script', agentRole: 'writer', builtinStage: true, timeoutMs: 90_000 },
    { stageId: 'asset_search', agentRole: 'curator', builtinStage: true, timeoutMs: 90_000 },
    { stageId: 'video_plan', agentRole: 'planner', builtinStage: true, timeoutMs: 60_000 },
    {
      stageId: 'approval',
      agentRole: 'human',
      requiresApproval: true,
      approvalKind: 'plan',
      requiredArtifacts: ['videoPlan'],
    },
    {
      stageId: 'execute',
      agentRole: 'executor',
      toolName: 'video_generate_multimodal',
      inputMapping: {
        storeId: '$.context.storeId',
        missionId: '$.context.missionId',
        approvedPlan: '$.stageOutputs.video_plan.videoPlan',
        userMessage: '$.intent',
      },
      outputMapping: {
        artifact: 'artifact',
        videoUrl: 'videoUrl',
      },
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 },
      timeoutMs: 300_000,
    },
    { stageId: 'subtitle', agentRole: 'captioner', builtinStage: true, timeoutMs: 60_000 },
    { stageId: 'music_selection', agentRole: 'curator', builtinStage: true, timeoutMs: 60_000 },
    {
      stageId: 'final_asset_review',
      agentRole: 'human',
      requiresApproval: true,
      approvalKind: 'final_asset',
      requiredArtifacts: ['subtitleArtifact', 'musicSelection'],
    },
    { stageId: 'publish_handoff', agentRole: 'handoff', builtinStage: true, timeoutMs: 30_000 },
    { stageId: 'artifact_finalize', agentRole: 'finalizer', timeoutMs: 30_000 },
  ],
};

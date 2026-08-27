/**
 * creative_asset_factory_v1 — minimal creative asset orchestration proof.
 * Plan → Approval → Execute → Artifact finalize
 */

/** @type {import('../factoryDefinition.js').FactoryDefinitionSchema extends import('zod').ZodType<infer T> ? T : never} */
export const creativeAssetFactoryV1 = {
  factoryId: 'creative_asset_factory_v1',
  version: '1.1.0',
  name: 'Creative Asset Factory V1',
  description: 'Plan → approve → generate → post-production (narration + captions) → validate → artifact.',
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
    planOutputPath: 'stageOutputs.creative_plan.plan',
    mergeStrategy: 'replace_plan',
  },
  artifactPolicy: {
    artifactType: 'generated_video',
    artifactTypeResolver: 'policy',
    finalizeStageId: 'artifact_finalize',
    sourceStageIds: ['video_media_validation', 'video_post_production', 'creative_execute'],
    requiredFields: [],
    persist: true,
  },
  stages: [
    {
      stageId: 'creative_plan',
      agentRole: 'planner',
      toolName: 'video_plan',
      inputMapping: {
        storeId: '$.context.storeId',
        userMessage: '$.intent',
        brandTone: '$.context.brandTone',
      },
      outputMapping: {
        plan: 'plan',
        planSchema: 'planSchema',
      },
      timeoutMs: 120_000,
    },
    {
      stageId: 'approval',
      agentRole: 'human',
      requiresApproval: true,
      requiredArtifacts: ['plan'],
    },
    {
      stageId: 'creative_execute',
      agentRole: 'executor',
      toolName: 'video_generate_multimodal',
      inputMapping: {
        storeId: '$.context.storeId',
        missionId: '$.context.missionId',
        approvedPlan: '$.stageOutputs.creative_plan.plan',
        userMessage: '$.intent',
      },
      outputMapping: {
        artifact: 'artifact',
        videoUrl: 'videoUrl',
      },
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 },
      timeoutMs: 300_000,
    },
    {
      stageId: 'video_post_production',
      agentRole: 'post_production',
      toolName: 'video_post_production',
      inputMapping: {
        storeId: '$.context.storeId',
        missionId: '$.context.missionId',
        approvedPlan: '$.stageOutputs.creative_plan.plan',
        videoOutput: '$.stageOutputs.creative_execute',
        userMessage: '$.intent',
      },
      outputMapping: {
        artifact: 'artifact',
        videoUrl: 'videoUrl',
        captionUrl: 'captionUrl',
        hasAudio: 'hasAudio',
        outcomeReport: 'outcomeReport',
      },
      requiredArtifacts: ['videoUrl'],
      retryPolicy: { maxAttempts: 2, backoffMs: 1500 },
      timeoutMs: 180_000,
    },
    {
      stageId: 'video_media_validation',
      agentRole: 'validator',
      toolName: 'video_media_validation',
      inputMapping: {
        approvedPlan: '$.stageOutputs.creative_plan.plan',
        postProduction: '$.stageOutputs.video_post_production',
        userMessage: '$.intent',
      },
      outputMapping: {
        artifact: 'artifact',
        videoUrl: 'videoUrl',
        hasAudio: 'hasAudio',
        captionUrl: 'captionUrl',
        validationStatus: 'validationStatus',
      },
      requiredArtifacts: ['videoUrl'],
      retryPolicy: { maxAttempts: 1, backoffMs: 500 },
      timeoutMs: 60_000,
    },
    {
      stageId: 'artifact_finalize',
      agentRole: 'finalizer',
      outputMapping: {
        artifactId: 'artifactId',
        url: 'url',
        status: 'status',
      },
      timeoutMs: 30_000,
    },
  ],
};

